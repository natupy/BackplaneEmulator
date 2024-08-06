module.exports ={
    chksum8
}

function chksum8 (buff)
{
let chcksum = 0;
    for (let i = 0; i < buff.length - 1 ; i++ ){
        chcksum += buff[i]
        chcksum &= 0xFF
      }
    return  chcksum = (0xFF - chcksum + 1) & 0xFF
}

