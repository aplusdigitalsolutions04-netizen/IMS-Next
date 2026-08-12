const mysql = require('mysql2/promise');

async function migrateOrdersAndOthers() {
  const source = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const dest = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const companyGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf'; // A Plus company

    async function copyTable(table) {
      try {
        const [rows] = await source.query(`SELECT * FROM ${table}`);
        if (rows.length === 0) return;
        const cols = Object.keys(rows[0]);
        
        const placeholders = cols.map(() => '?').join(',');
        const query = `INSERT IGNORE INTO newdb.${table} (${cols.join(',')}) VALUES (${placeholders})`;

        for (let r of rows) {
          await dest.query(query, cols.map(c => r[c]));
        }
        console.log(`Copied ${rows.length} rows to ${table}`);
      } catch (err) {
        console.log(`Skipped table ${table}: ${err.message}`);
      }
    }

    const tablesToCopy = [
      'orders',
      'order_items',
      'order_logistics',
      'order_installations',
      'order_documents',
      'orderdocuments',
      'payments',
      'returns',
      'replacementhistory',
      'serialmovements',
      'stocktransferhistory',
      'fbf_fba_platforms',
      'fbf_fba_states',
      'fbf_fba_stock',
      'fbf_fba_transactions',
      'fbf_fba_warehouses',
      'warranty_certificates',
      'warranty_template',
      'warranty_templates',
      'wc_certs',
      'inventorystockout',
      'inventorystockoutdetail',
      'inventorystockoutserial',
      'inventorystockledger',
      'inventoryvendor',
      'useractivitylogs',
      'inventoryvariantstock',
      'inventorycategorybrandmapping',
      'inventorycombomapping',
      'inventoryskucomponent',
      'inventorystationeryreturns',
      'inventorytags'
    ];

    console.log('Copying additional tables...');
    await dest.query('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const table of tablesToCopy) {
      await copyTable(table);
      
      // Update companyGuid if column exists
      try {
        await dest.query(`UPDATE newdb.${table} SET companyGuid = ? WHERE companyGuid = '' OR companyGuid IS NULL`, [companyGuid]);
      } catch(e) {}
    }

    await dest.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log("Orders & other data migration complete!");
  } catch (err) {
    console.error("Migration Failed:", err);
  } finally {
    source.end();
    dest.end();
  }
}

migrateOrdersAndOthers();
