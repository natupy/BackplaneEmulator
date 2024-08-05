const { execSync } = require('child_process');
const http = require('http');
const pty = require('node-pty');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Cargar configuración
const config = JSON.parse(fs.readFileSync('config.json'));

// Variables de estado
let mainDoorStatus = false;
let billDoorStatus = false;
let logicDoorStatus = false;
let collectButton = false;
let techButton = false;
let spinButton = false;
let collectLamp = 'darkgreen';
let spinLamp = 'darkgreen';

let bufferRx = new Uint8Array(256);
let cantRx = 0;

let wsBackplane;

const lampSpinCode= '1'
const lampCollectCode= '3'

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
  // setCollectLamp(true);
  // setSpinLamp(true);

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
      if (lampCode == lampSpinCode)
        setSpinLamp(value)
      else if (lampCode == lampCollectCode)
        setCollectLamp(value)
    break;
  }

  sendStatus();
}

// Función para enviar el estado
function sendStatus() {

  // Enviar el buffer a través del socket o interfaz correspondiente
  const statusBuffer = Buffer.from([
    0x31, 0x30, 0x53,
    spinButton ? 0x31 : 0x30,
    techButton ? 0x31 : 0x30,
    logicDoorStatus ? 0x31 : 0x30,
    collectButton ? 0x31 : 0x30,
    0x30,
    billDoorStatus ? 0x31 : 0x30,
    mainDoorStatus ? 0x31 : 0x30,
    0x31, 0x30 
  ]);
  // Enviar el buffer a través del PTY
  if (wsBackplane)
    wsBackplane.send(statusBuffer);

}

// Función para ajustar el color de la lámpara de recolección (collect lamp)
function setCollectLamp(status) {
  console.log(`Collect Lamp set to: ${collectLamp}`);

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
  console.log(`Spin Lamp set to: ${spinLamp}`);

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
