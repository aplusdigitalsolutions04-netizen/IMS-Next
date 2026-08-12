const mysql = require('mysql2/promise');

async function checkSerials() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const [cnt] = await c.query("SELECT COUNT(*) as c FROM inventorystockinserial WHERE isDeleted=0 AND serialStatus='Available'");
    console.log('Available serials:', cnt[0].c);
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
checkSerials();
