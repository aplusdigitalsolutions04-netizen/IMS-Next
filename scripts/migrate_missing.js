const mysql = require('mysql2/promise');

async function migrateMissing() {
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
        const query = `INSERT IGNORE INTO newdb.${table} (${cols.map(c => '\`' + c + '\`').join(',')}) VALUES (${placeholders})`;

        for (let r of rows) {
          await dest.query(query, cols.map(c => r[c]));
        }
        console.log(`Copied ${rows.length} rows to ${table}`);
      } catch (err) {
        console.log(`Skipped table ${table}: ${err.message}`);
      }
    }

    const tablesToCopy = [
      'returns',
      'payments'
    ];

    console.log('Copying missing tables...');
    await dest.query('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const table of tablesToCopy) {
      await copyTable(table);
      
      try {
        await dest.query(`UPDATE newdb.${table} SET companyGuid = ? WHERE companyGuid = '' OR companyGuid IS NULL`, [companyGuid]);
      } catch(e) {}
    }

    await dest.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log("Missing data migration complete!");
  } catch (err) {
    console.error("Migration Failed:", err);
  } finally {
    source.end();
    dest.end();
  }
}

migrateMissing();
