const mysql = require('mysql2/promise');

async function checkMonitor() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});

  try {
    const [models] = await c.query("SELECT guid, name, mainCategory, category FROM models WHERE name LIKE '%monitor%' OR name LIKE '%Monitor%' OR category LIKE '%monitor%'");
    console.log('legacy monitor models:', models);
    
    const [variants] = await c.query("SELECT itemVariantId, itemId, variantName FROM inventoryitemvariant WHERE variantName LIKE '%monitor%' OR variantName LIKE '%Monitor%'");
    console.log('modern inventory monitor variants:', variants);

    // Also check serials for the modern monitor variants
    for(const v of variants) {
       const [serials] = await c.query("SELECT * FROM inventorystockinserial WHERE itemVariantId=?", [v.itemVariantId]);
       console.log(`Serials for modern monitor ${v.variantName}:`, serials.length);
    }
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
checkMonitor();
