const mysql = require('mysql2/promise');
async function migrate() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820'});
  const tables = ['fbf_fba_platforms', 'fbf_fba_states', 'fbf_fba_stock', 'fbf_fba_transactions', 'fbf_fba_warehouses'];
  for (const t of tables) {
    try {
      await c.query('TRUNCATE TABLE newdb.' + t);
      await c.query('INSERT INTO newdb.' + t + ' SELECT * FROM imnew.' + t);
      console.log('Migrated ' + t);
    } catch (err) {
      console.error('Error migrating ' + t + ':', err.message);
    }
  }
  c.end();
}
migrate();
