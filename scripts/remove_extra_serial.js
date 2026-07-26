const mysql = require('mysql2/promise');

async function removeExtra() {
  const cNew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    await cNew.query("DELETE FROM inventorystockinserial WHERE serialId='f7a96d71-9c05-45ba-b57d-ef8cbbf4c2e8'");
    console.log('Deleted duplicate modern serial');
  } catch (err) {
    console.error(err);
  } finally {
    cNew.end();
  }
}
removeExtra();
