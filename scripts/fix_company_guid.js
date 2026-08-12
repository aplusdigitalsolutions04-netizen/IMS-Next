const mysql = require('mysql2/promise');

async function fixCompanyGuid() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    const companyGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf';
    
    const tables = [
      'inventoryitemmaster',
      'inventoryitemvariant',
      'inventorycategorymaster',
      'inventorybrandmaster',
      'inventoryunitmaster',
      'inventorystockin',
      'inventorystockindetail',
      'inventorystockinserial'
    ];
    
    for (let table of tables) {
      try {
        await c.query(`UPDATE ${table} SET companyGuid = ? WHERE companyGuid = '' OR companyGuid IS NULL`, [companyGuid]);
        console.log(`Updated companyGuid in ${table}`);
      } catch (err) {
        console.log(`Skipped ${table}: ${err.message}`);
      }
    }
    
    // Also godowns, if they have companyGuid
    try {
      await c.query(`UPDATE godowns SET companyGuid = ? WHERE companyGuid = '' OR companyGuid IS NULL`, [companyGuid]);
      console.log('Updated companyGuid in godowns');
    } catch(e) {}
    
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
fixCompanyGuid();
