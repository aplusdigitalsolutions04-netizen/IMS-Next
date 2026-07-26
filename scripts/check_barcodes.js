const mysql = require('mysql2/promise');

async function checkLegacyBarcodes() {
  const cOld = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [models] = await cOld.query("SELECT guid, barcode FROM models WHERE barcode IS NOT NULL AND barcode != '' AND isDeleted=0");
    console.log('Legacy models with barcode:', models.length);
    
    // Also check how many modern inventoryvariantbarcode exist in imnew
    const [modern] = await cOld.query("SELECT * FROM inventoryvariantbarcode");
    console.log('Modern inventoryvariantbarcode in imnew:', modern.length);
  } catch (err) {
    console.error(err);
  } finally {
    cOld.end();
    cNew.end();
  }
}
checkLegacyBarcodes();
