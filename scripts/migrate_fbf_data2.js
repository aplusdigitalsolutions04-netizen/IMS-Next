const mysql = require('mysql2/promise');
async function migrate() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820'});
  
  try {
    await c.query('TRUNCATE TABLE newdb.fbf_fba_stock');
    await c.query('INSERT INTO newdb.fbf_fba_stock (guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, quantity, lastUpdated, companyGuid) SELECT guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, quantity, lastUpdated, NULL FROM imnew.fbf_fba_stock');
    console.log('Migrated fbf_fba_stock');
  } catch (err) {
    console.error('Error migrating fbf_fba_stock:', err.message);
  }

  try {
    await c.query('TRUNCATE TABLE newdb.fbf_fba_transactions');
    await c.query('INSERT INTO newdb.fbf_fba_transactions (guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, amount, transactionDate, referenceId, orderId, serialNumbers, createdAt, createdBy, companyGuid) SELECT guid, modelId, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, amount, transactionDate, referenceId, NULL, serialNumbers, createdAt, createdBy, NULL FROM imnew.fbf_fba_transactions');
    console.log('Migrated fbf_fba_transactions');
  } catch (err) {
    console.error('Error migrating fbf_fba_transactions:', err.message);
  }

  c.end();
}
migrate();
