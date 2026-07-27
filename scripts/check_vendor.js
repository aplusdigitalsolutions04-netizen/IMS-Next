const mysql = require('mysql2/promise');
async function check() {
  const c1 = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const c2 = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  const [imnew_t] = await c1.query("SHOW TABLES LIKE '%vendor%'");
  console.log('imnew:', imnew_t.map(r => Object.values(r)[0]));
  const [newdb_t] = await c2.query("SHOW TABLES LIKE '%vendor%'");
  console.log('newdb:', newdb_t.map(r => Object.values(r)[0]));
  c1.end(); c2.end();
}
check();
