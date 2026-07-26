const mysql = require('mysql2/promise');

async function fixMonitorDetails() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [details] = await c.query("SELECT stockInDetailId, itemVariantId, stockInQty, purchaseRate, unitPrice FROM inventorystockindetail WHERE itemVariantId IN ('2a884613-f8b2-429e-addb-f63611f1b763', '9ca82a1d-5285-4b93-90fc-2cda9f1e3967')");
    console.log('Monitor stock in details in imnew:', details);
    
    // Ensure variant stock exists
    for (const d of details) {
       // get count of available serials
       const [serials] = await cNew.query("SELECT COUNT(*) as c FROM inventorystockinserial WHERE itemVariantId=? AND isSold=0", [d.itemVariantId]);
       const availablePCS = serials[0].c;
       const price = d.purchaseRate || d.unitPrice || 0;
       
       await cNew.query(`
         INSERT INTO inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate, lastUpdatedOn) 
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE availablePCS = VALUES(availablePCS), avgPurchaseRate = VALUES(avgPurchaseRate), lastPurchaseRate = VALUES(lastPurchaseRate)
       `, [d.itemVariantId, availablePCS, price, price]);
       
       // Update the landingPrice of the serials
       await cNew.query("UPDATE inventorystockinserial SET landingPrice = ? WHERE itemVariantId = ?", [price, d.itemVariantId]);
    }
    console.log('Fixed missing monitor stocks and landing prices in newdb!');
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
    cNew.end();
  }
}
fixMonitorDetails();
