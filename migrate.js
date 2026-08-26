
const mysql = require('mysql2/promise');
const companyGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf';

async function run() {
  const source = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const dest = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [tables] = await source.query('SHOW TABLES');
    
    await dest.query('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const t of tables) {
      const table = Object.values(t)[0];
      if (['users', 'roles', 'companies', 'user_companies', 'selling_platforms', 'selling_platform_fields'].includes(table)) {
        continue; // skip core setup tables
      }
      
      try {
        await dest.query('TRUNCATE TABLE \' + table + '\');
        console.log('Truncated ' + table);
        
        const [rows] = await source.query('SELECT * FROM \' + table + '\');
        if (rows.length === 0) continue;
        
        const [destCols] = await dest.query('SHOW COLUMNS FROM \' + table + '\');
        const destColNames = destCols.map(c => c.Field);
        
        const colsToInsert = Object.keys(rows[0]).filter(c => destColNames.includes(c));
        
        let hasCompanyGuid = destColNames.includes('companyGuid');
        let insertCols = [...colsToInsert];
        if (hasCompanyGuid && !insertCols.includes('companyGuid')) {
          insertCols.push('companyGuid');
        }
        
        const placeholders = insertCols.map(() => '?').join(',');
        const query = 'INSERT IGNORE INTO \' + table + '\ (' + insertCols.map(c => '\'+c+'\').join(',') + ') VALUES (' + placeholders + ')';
        
        for (const row of rows) {
          const values = colsToInsert.map(c => row[c]);
          if (hasCompanyGuid && !colsToInsert.includes('companyGuid')) {
            values.push(companyGuid);
          }
          await dest.query(query, values);
        }
        console.log('Migrated ' + rows.length + ' rows for ' + table);
      } catch(e) {
        console.error('Error on ' + table + ':', e.message);
      }
    }
    
    await dest.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Done!');
  } finally {
    source.end();
    dest.end();
  }
}
run();

