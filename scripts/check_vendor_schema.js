const mysql = require('mysql2/promise');
async function check() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820'});
  const [s1] = await c.query('DESCRIBE imnew.inventoryvendor');
  console.log('imnew.inventoryvendor:', s1.map(r => r.Field));
  const [s2] = await c.query('DESCRIBE newdb.inventoryvendor');
  console.log('newdb.inventoryvendor:', s2.map(r => r.Field));
  
  const [res1] = await c.query('SELECT COUNT(*) as c FROM imnew.inventoryvendor');
  console.log('imnew.inventoryvendor count:', res1[0].c);
  const [res2] = await c.query('SELECT COUNT(*) as c FROM newdb.inventoryvendor');
  console.log('newdb.inventoryvendor count:', res2[0].c);

  c.end();
}
check();
