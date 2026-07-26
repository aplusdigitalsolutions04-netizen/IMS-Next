const mysql = require('mysql2/promise');

async function checkNewdbSerials() {
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [serials] = await cNew.query("SELECT s.*, v.variantName FROM inventorystockinserial s LEFT JOIN inventoryitemvariant v ON s.itemVariantId = v.itemVariantId WHERE v.variantName LIKE '%HP P204v%' OR v.variantName LIKE '%HP P22vb%'");
    console.log('Monitor serials in newdb:', serials.length);
  } catch (err) {
    console.error(err);
  } finally {
    cNew.end();
  }
}
checkNewdbSerials();
