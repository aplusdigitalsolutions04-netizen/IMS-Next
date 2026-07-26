const mysql = require('mysql2/promise');

async function findExtra() {
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  const cOld = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});

  try {
    const [newSerials] = await cNew.query("SELECT serialNumber, itemVariantId FROM inventorystockinserial WHERE isSold=0 AND isUsed=0 AND serialStatus='Available'");
    const [oldSerials] = await cOld.query("SELECT value FROM serials WHERE status='Available' AND isDeleted=0");
    
    const oldSet = new Set(oldSerials.map(s => s.value));
    const extra = newSerials.filter(s => !oldSet.has(s.serialNumber));
    
    console.log('Extra serials:', extra);
  } catch (err) {
    console.error(err);
  } finally {
    cNew.end();
    cOld.end();
  }
}
findExtra();
