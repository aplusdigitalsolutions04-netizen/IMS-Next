const mysql = require('mysql2/promise');

async function migrateVariantBarcodes() {
  const cOld = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [barcodes] = await cOld.query("SELECT * FROM inventoryvariantbarcode");
    
    for (const b of barcodes) {
      await cNew.query(`
        INSERT IGNORE INTO inventoryvariantbarcode
        (barcodeId, itemVariantId, barcode, subUnitQty, isDeleted, createdAt, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [b.barcodeId, b.itemVariantId, b.barcode, b.subUnitQty, b.isDeleted, b.createdAt, b.createdBy]);
    }
    
    console.log(`Migrated ${barcodes.length} variant barcodes.`);
  } catch (err) {
    console.error(err);
  } finally {
    cOld.end();
    cNew.end();
  }
}
migrateVariantBarcodes();
