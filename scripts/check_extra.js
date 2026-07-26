const mysql = require('mysql2/promise');

async function checkExtra() {
  const cOld = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [oldSerials] = await cOld.query("SELECT guid, value, status, isDeleted FROM serials WHERE value='VNC3T19715'");
    console.log('imnew data for VNC3T19715:', oldSerials);
    
    const [newSerials] = await cNew.query("SELECT serialId, serialNumber, isSold, isUsed, serialStatus FROM inventorystockinserial WHERE serialNumber='VNC3T19715'");
    console.log('newdb data for VNC3T19715:', newSerials);
  } catch (err) {
    console.error(err);
  } finally {
    cOld.end();
    cNew.end();
  }
}
checkExtra();
