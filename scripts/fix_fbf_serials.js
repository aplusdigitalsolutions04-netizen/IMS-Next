const mysql = require('mysql2/promise');

async function fixFBF() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  const cImnew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});

  try {
    const [serials] = await cImnew.query("SELECT guid FROM serials WHERE status = 'FBF'");
    let updatedCount = 0;
    
    for (const s of serials) {
      await c.query(`
        UPDATE inventorystockinserial 
        SET isSold = 1, isUsed = 1, serialStatus = 'FBF' 
        WHERE serialId = ?
      `, [s.guid]);
      updatedCount++;
    }
    
    console.log(`Fixed ${updatedCount} FBF serials.`);
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
    cImnew.end();
  }
}
fixFBF();
