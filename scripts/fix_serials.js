const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  const cImnew = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});

  try {
    const [serials] = await cImnew.query('SELECT guid, status FROM serials');
    let updatedCount = 0;
    
    for (const s of serials) {
      if (s.status === 'Available') continue;
      
      let isSold = 0;
      let isUsed = 0;
      let serialStatus = 'Available';

      if (s.status === 'Dispatched') {
          isSold = 1;
          isUsed = 1;
          serialStatus = 'Sold';
      } else if (s.status === 'FBF') {
          // FBF is usually in FBA warehouse, so still technically available or maybe in transit. Let's just set serialStatus to FBF.
          serialStatus = 'Available'; // Wait, in modern IMS, does FBF mean sold? No, it's just in another warehouse.
      } else if (s.status === 'Damaged') {
          isUsed = 1;
          serialStatus = 'Damaged';
      } else if (s.status === 'sold') {
          isSold = 1;
          isUsed = 1;
          serialStatus = 'Sold';
      }

      await c.query(`
        UPDATE inventorystockinserial 
        SET isSold = ?, isUsed = ?, serialStatus = ? 
        WHERE serialId = ?
      `, [isSold, isUsed, serialStatus, s.guid]);
      updatedCount++;
    }
    
    console.log(`Updated ${updatedCount} serials in newdb based on imnew legacy status.`);
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
    cImnew.end();
  }
}
run();
