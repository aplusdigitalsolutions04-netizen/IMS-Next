const mysql = require('mysql2/promise');
async function check() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    const [res] = await c.query('SELECT guid FROM companies LIMIT 1');
    console.log('companyGuid:', res.length > 0 ? res[0].guid : 'none');
  } catch (err) {
    console.log(err.message);
  }
  c.end();
}
check();
