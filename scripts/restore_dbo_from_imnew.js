const mysql = require('mysql2/promise');

async function restoreDbo() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'dbo'});
  const cSource = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});

  try {
    await c.query('SET FOREIGN_KEY_CHECKS = 0');
    const [tables] = await c.query('SHOW TABLES');
    
    for (let t of tables) {
      const table = Object.values(t)[0];
      
      try {
        const [nCols] = await cSource.query('DESCRIBE `' + table + '`');
        const [dCols] = await c.query('DESCRIBE `' + table + '`');
        
        const nNames = nCols.map(col => col.Field);
        const dNames = dCols.map(col => col.Field);
        
        const common = dNames.filter(n => nNames.includes(n));
        
        if (common.length === 0) continue;

        const selCols = common.map(n => `\`${n}\``).join(', ');
        const q = `INSERT IGNORE INTO dbo.\`${table}\` (${selCols}) SELECT ${selCols} FROM imnew.\`${table}\``;
        
        await c.query(q);
        console.log(`Restored ${table}`);
      } catch(err) {
        console.log(`Skipping table ${table}: ${err.message}`);
      }
    }
    
    await c.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Restoration of dbo completed successfully!');

  } catch (e) {
    console.error('Fatal error:', e);
  } finally {
    c.end();
    cSource.end();
  }
}

restoreDbo();
