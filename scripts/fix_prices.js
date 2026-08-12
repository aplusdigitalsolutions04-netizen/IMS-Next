const mysql = require('mysql2/promise');

async function fixPrices() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    // 1. Enable showMrp for all categories so MRP shows up in frontend
    await c.query(`UPDATE inventorycategorymaster SET showMrp = 1`);
    console.log('Enabled showMrp for all categories');

    // 2. Update landing prices in inventorystockinserial from imnew.serials
    await c.query(`
      UPDATE newdb.inventorystockinserial ns 
      JOIN imnew.serials os ON ns.serialId = os.guid 
      SET 
        ns.landingPrice = os.landingPrice,
        ns.landingPriceReason = os.landingPriceReason,
        ns.returnCount = os.returnCount,
        ns.vendorId = os.vendorId,
        ns.fbfFbaType = os.fbfFbaType
    `);
    console.log('Restored landingPrice and other missing fields from legacy serials');

  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
fixPrices();
