const mysql = require('mysql2/promise');

async function r() { 
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'}); 
  const [tables] = await c.query('SHOW TABLES'); 
  for(const t of tables) { 
    const tableName = Object.values(t)[0]; 
    if (tableName.startsWith('_backup')) continue;
    
    const [cols] = await c.query('DESCRIBE ' + tableName); 
    const hasCompanyGuid = cols.some(x=>x.Field==='companyGuid'); 
    if(hasCompanyGuid) { 
      const [count] = await c.query("SELECT COUNT(*) as c FROM " + tableName + " WHERE companyGuid IS NULL OR companyGuid=''"); 
      if (count[0].c > 0) {
        console.log(tableName, 'has missing companyGuid:', count[0].c); 
      }
    } 
  } 
  c.end(); 
} 
r();
