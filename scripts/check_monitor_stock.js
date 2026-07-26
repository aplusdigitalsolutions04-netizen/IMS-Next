const mysql = require('mysql2/promise');

async function checkMonitorStock() {
  const cOld = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [stocksOld] = await cOld.query("SELECT s.*, v.variantName FROM inventoryvariantstock s JOIN inventoryitemvariant v ON s.itemVariantId = v.itemVariantId WHERE v.variantName LIKE '%HP P204v%' OR v.variantName LIKE '%HP P22vb%'");
    console.log('Monitor variant stocks in imnew:', stocksOld);

    // If they exist in imnew but not newdb, let's copy them to newdb
    for(const s of stocksOld) {
       await cNew.query(`INSERT IGNORE INTO inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate, lastUpdatedOn) VALUES (?, ?, ?, ?, ?)`, [s.itemVariantId, s.availablePCS, s.avgPurchaseRate, s.lastPurchaseRate, s.lastUpdatedOn]);
    }
    console.log(`Copied ${stocksOld.length} stocks to newdb.`);

  } catch (err) {
    console.error(err);
  } finally {
    cOld.end();
    cNew.end();
  }
}
checkMonitorStock();
