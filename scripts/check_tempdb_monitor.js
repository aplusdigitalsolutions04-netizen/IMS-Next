const mysql = require('mysql2/promise');

async function checkTempDb() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'tempdb'});

  try {
    const [x] = await c.query("SELECT * FROM inventorystockinserial WHERE itemVariantId='6dbe16ee-e370-42d6-94bd-37b70b168e61'");
    console.log('tempdb monitor serials count:', x.length);
    if(x.length > 0) {
      console.log('Sample serial:', x[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
checkTempDb();
