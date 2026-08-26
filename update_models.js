
const mysql = require('mysql2/promise');

async function run() {
  const db = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    await db.query('UPDATE inventoryitemvariant v JOIN models m ON v.itemVariantId = m.guid SET v.colorType = m.colorType, v.printerType = m.printerType, v.packagingCost = m.packagingCost, v.mainCategory = m.mainCategory, v.cpu = m.cpu, v.ram = m.ram, v.ssdHdd = m.' + String.fromCharCode(96) + 'ssd/hdd' + String.fromCharCode(96) + ', v.screenSize = m.screenSize, v.resolution = m.resolution, v.panelType = m.panelType, v.refreshRate = m.refreshRate');
    console.log('Updated models');
  } catch(e) {
    console.error(e);
  } finally {
    db.end();
  }
}
run();

