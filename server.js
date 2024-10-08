const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { chksum8 } = require('./services/utils');

// Cargar configuración
const config = JSON.parse(fs.readFileSync('config.json'));

// Variables de estado
let mainDoorStatus = false;
let billDoorStatus = false;
let logicDoorStatus = false;
let collectButton = false;
let techButton = false;
let spinButton = false;
let collectLampStatus = false;
let spinLampStatus = false;
let boardColorStatus= {R:0,G:0,B:0}
let bufferRx = new Uint8Array(256);
let cantRx = 0;

let wsBackplane;

const lampSpinCode= '1'
const lampCollectCode= '3'
let timeoutVLTService;
// Servidor web
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(config.webServerPort, () => {
  console.log(`Servidor web escuchando en el puerto ${config.webServerPort}`);
});


// WebSocket Server
const wssHtml = new WebSocket.Server({ port: config.webSocketHTML });

wssHtml.on('connection', (wsHtml) => {
  console.log('Cliente conectado');
  setBoardColor(boardColorStatus)
  setCollectLamp(collectLampStatus);
  setSpinLamp(spinLampStatus);

  wsHtml.on('message', (message) => {
    // Parsear el mensaje recibido y actualizar el estado
    try {
      const data = JSON.parse(message);
      mainDoorStatus = data.mainDoorStatus;
      billDoorStatus = data.billDoorStatus;
      logicDoorStatus = data.logicDoorStatus;
      collectButton = data.collectButton;
      techButton = data.techButton;
      spinButton = data.spinButton;

//      console.log('Estado actualizado desde el cliente:', data);
    } catch (error) {
      console.error('Error al parsear mensaje:', error);
    }
  });

  wsHtml.on('close', () => {
    console.log('Cliente desconectado');
  });
});


const wssBackplane = new WebSocket.Server({ port: config.webSocketBackplane });

wssBackplane.on('connection', (ws) => {
    wsBackplane = ws;
    console.log('Cliente conectado');
    wsBackplane.on('message', (message) => {
    for (let i = 0; i < message.length; i++) 
      bufferRx[i] =  message[i];
    cantRx = message.length
    onData();
  });

  wsBackplane.on('close', () => {
    console.log('Cliente desconectado');
    wsBackplane= null;
  });
})


// Función para analizar los datos recibidos
function onData() {
  // console.log('Datos recibidos:', bufferRx.slice(0, cantRx).toString());
  cantRx = 0; // Reiniciar contador de bytes recibidos

  // Actualizar el estado de collectLamp y spinLamp según los datos recibidos
  const cmd = String.fromCharCode(bufferRx[4])
  // console.log (cmd)
  switch (cmd){
    case 'L':
      const lampCode = String.fromCharCode(bufferRx[5]);
      const value = bufferRx[6] === 0x31

      if (lampCode == lampSpinCode){
        spinLampStatus = value;
        setSpinLamp(value)
      }
      else if (lampCode == lampCollectCode){
        collectLampStatus = value;
        setCollectLamp(value)
      }
    break;
    case 'A':
        //02 3D 30 31 41 38 30 30 30 30 30 03 FF 
        const R =  (bufferRx[5] & 0x0F) *16 + (bufferRx[6] & 0x0F)
        const G =  (bufferRx[7] & 0x0F) *16 + (bufferRx[8] & 0x0F)
        const B =  (bufferRx[9] & 0x0F) *16 + (bufferRx[10] & 0x0F)
        setBoardColor({R,G,B})
    break;    
  }
  sendStatus();
  clearTimeout(timeoutVLTService)
  timeoutVLTService = setTimeout(VLTServiceOut, 2000)
}

// Función para enviar el estado
function sendStatus() {
  const STX = 0x02
  const ETX = 0x03

  // Enviar el buffer a través del socket o interfaz correspondiente
    let statusBuffer = Buffer.from([
    STX,
    0x00,
    0x31,   // client to host
    0x30,   // client to host
    'S'.charCodeAt(0),   // 'S' char
    spinButton ? 0x31 : 0x30,
    techButton ? 0x31 : 0x30,
    logicDoorStatus ? 0x31 : 0x30,
    collectButton ? 0x31 : 0x30,
    0x30, //dummy
    billDoorStatus ? 0x31 : 0x30,
    mainDoorStatus ? 0x31 : 0x30,
    0x30, //dummy
    ETX, 
    0x00  
  ]);
  statusBuffer[1]= statusBuffer.length + 0x30;
  statusBuffer[statusBuffer.length -1] = chksum8(statusBuffer);
  // Enviar el buffer a través del PTY
  if (wsBackplane)
    wsBackplane.send(statusBuffer);

}

// Función para ajustar el color de la lámpara de recolección (collect lamp)
function setCollectLamp(status) {
  console.log(`Collect Lamp set to: ${collectLampStatus}`);

  // Enviar el nuevo estado a través del WebSocket
  const message = JSON.stringify({
    collectLamp: status,
  });
  wssHtml.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Función para ajustar el color de la lámpara de giro (spin lamp)
function setSpinLamp(status) {
  console.log(`Spin Lamp set to: ${spinLampStatus}`);

  // Enviar el nuevo estado a través del WebSocket
  const message = JSON.stringify({
    spinLamp: status,
  });
  wssHtml.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function setBoardColor(params){
  boardColorStatus = params
  console.log ('borderColorSetTo: ',params)
  const message = JSON.stringify({
    setBorderColor: true,
    ...params
  });
  wssHtml.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

}

function VLTServiceOut()
{
  setBoardColor({R:0,G:0,B:0})
  setCollectLamp(false) 
  setSpinLamp(false) 
   
}