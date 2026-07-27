const mysql = require('mysql2/promise');
async function migrate() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820'});
  const cGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf';
  try {
    await c.query('TRUNCATE TABLE newdb.fbf_fba_stock');
    await c.query('INSERT INTO newdb.fbf_fba_stock (guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, quantity, lastUpdated, companyGuid) SELECT guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, quantity, lastUpdated, ? FROM imnew.fbf_fba_stock', [cGuid]);
    console.log('Migrated fbf_fba_stock');
  } catch (err) {
    console.error('Error migrating fbf_fba_stock:', err.message);
  }

  try {
    await c.query('TRUNCATE TABLE newdb.fbf_fba_transactions');
    await c.query('INSERT INTO newdb.fbf_fba_transactions (guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, amount, transactionDate, referenceId, orderId, serialNumbers, createdAt, createdBy, companyGuid) SELECT guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, amount, transactionDate, referenceId, NULL, serialNumbers, createdAt, createdBy, ? FROM imnew.fbf_fba_transactions', [cGuid]);
    console.log('Migrated fbf_fba_transactions');
  } catch (err) {
    console.error('Error migrating fbf_fba_transactions:', err.message);
  }

  c.end();
}
migrate();
