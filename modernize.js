
const mysql = require('mysql2/promise');
const companyGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf';
const printerItemId = '995c0383-f7c4-4f6d-bbc3-4980f45386d9';

async function run() {
  const db = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    const [models] = await db.query('SELECT * FROM models WHERE isDeleted = 0');
    console.log('Migrating ' + models.length + ' models');
    for (const m of models) {
      const variantId = m.guid;
      const query = 'INSERT IGNORE INTO inventoryitemvariant (itemVariantId, itemId, variantName, sku, purchasePrice, sellingPrice, stockQty, status, isDeleted, createdAt, companyGuid) VALUES (?, ?, ?, ?, 0, ?, ?, 1, 0, NOW(), ?)';
      await db.query(query, [variantId, printerItemId, m.name, m.barcode || null, m.mrp || 0, m.stockQuantity || 0, companyGuid]);
    }
    
    const [serials] = await db.query('SELECT * FROM serials WHERE isDeleted = 0');
    console.log('Migrating ' + serials.length + ' serials');
    for (const s of serials) {
      const serialStatus = s.status === 'In' ? 'Available' : (s.status === 'Out' ? 'Dispatched' : (s.status === 'Return' ? 'Returned' : s.status));
      const isSold = serialStatus === 'Dispatched' ? 1 : 0;
      
      if (s.value && s.modelGuid) {
        const query = 'INSERT IGNORE INTO inventorystockinserial (serialId, guid, itemVariantId, serialNumber, serialStatus, isSold, isDeleted, createdAt, companyGuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        await db.query(query, [s.guid, s.guid, s.modelGuid, s.value, serialStatus, isSold, s.isDeleted || 0, s.createdAt || new Date(), companyGuid]);
      }
    }
    console.log('Done mapping models & serials!');
  } catch(e) {
    console.error(e);
  } finally {
    db.end();
  }
}
run();

