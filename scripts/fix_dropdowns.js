const mysql = require('mysql2/promise');
async function fixDropdowns() { 
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    const guid = '013ccc62-9170-40cb-a109-1c968ccfdfbf';
    await c.query(`UPDATE dropdown_master SET companyGuid = ? WHERE companyGuid = '' OR companyGuid IS NULL`, [guid]);
    await c.query(`UPDATE dropdown_option SET companyGuid = ? WHERE companyGuid = '' OR companyGuid IS NULL`, [guid]);
    console.log('Dropdowns fixed');
  } catch(e) {
    console.error(e);
  } finally {
    c.end();
  }
}
fixDropdowns();
