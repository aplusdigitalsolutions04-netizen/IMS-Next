const mysql = require('mysql2/promise');

async function updateCompany() {
  const dest = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    await dest.query("UPDATE companies SET name = 'A Plus Digital Solutions' WHERE name = 'Default Company'");
    console.log('Company name updated');
  } catch (err) {
    console.error(err);
  } finally {
    dest.end();
  }
}
updateCompany();
