const mysql = require('mysql2/promise');
async function migrate() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820'});
  const cGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf';
  try {
    await c.query('TRUNCATE TABLE newdb.inventoryvendor');
    const [cols] = await c.query('DESCRIBE imnew.inventoryvendor');
    const colNames = cols.map(c => c.Field);
    const insertCols = [...colNames, 'companyGuid'].join(', ');
    const selectCols = colNames.join(', ');
    const query = 'INSERT INTO newdb.inventoryvendor (' + insertCols + ') SELECT ' + selectCols + ', ? FROM imnew.inventoryvendor';
    await c.query(query, [cGuid]);
    console.log('Migrated inventoryvendor successfully');
  } catch (err) {
    console.error('Error migrating inventoryvendor:', err.message);
  }
  c.end();
}
migrate();
