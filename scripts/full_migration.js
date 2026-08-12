const mysql = require('mysql2/promise');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

async function migrate() {
  const source = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'imnew'});
  const dest = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});

  try {
    const companyGuid = '013ccc62-9170-40cb-a109-1c968ccfdfbf'; // Default company

    console.log("Truncating newdb...");
    await dest.query('SET FOREIGN_KEY_CHECKS = 0');
    const [tables] = await dest.query('SHOW TABLES');
    for (let t of tables) {
      const table = Object.values(t)[0];
      await dest.query(`TRUNCATE TABLE \`${table}\``);
    }
    await dest.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log("Truncated.");

    async function copyTable(table) {
      try {
        const [rows] = await source.query(`SELECT * FROM ${table}`);
        if (rows.length === 0) return;
        const cols = Object.keys(rows[0]);
        
        const placeholders = cols.map(() => '?').join(',');
        const query = `INSERT IGNORE INTO newdb.${table} (${cols.join(',')}) VALUES (${placeholders})`;

        for (let r of rows) {
          await dest.query(query, cols.map(c => r[c]));
        }
        console.log(`Copied ${rows.length} rows to ${table}`);
      } catch (err) {
        console.log(`Skipped table ${table}: ${err.message}`);
      }
    }

    // 1. Core Users and Roles
    await copyTable('roles');
    await copyTable('companies');
    
    // Fallback company if empty
    try {
      await dest.query(`
        INSERT IGNORE INTO newdb.companies (guid, name, createdAt)
        VALUES (?, ?, NOW())
      `, [companyGuid, 'Default Company']);
    } catch(e) {
      console.log('Skipped companies:', e.message);
    }

    try {
      const [users] = await source.query("SELECT * FROM users");
      for (const u of users) {
        const uId = u.userid || u.id || uuidv4();
        await dest.query(`
          INSERT IGNORE INTO newdb.users (userid, username, password, role, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `, [uId, u.username, u.password, u.role, u.createdAt || new Date()]);
        
        await dest.query(`
          INSERT IGNORE INTO newdb.user_companies (userGuid, companyGuid, isDefault)
          VALUES (?, ?, 1)
        `, [uId, companyGuid]);
      }
    } catch(e) {
      console.log('Skipped users:', e.message);
    }

    await copyTable('dropdown_master');
    await copyTable('dropdown_option');
    await copyTable('godowns');

    // 2. Modern Inventory Tables
    await copyTable('inventorycategorymaster');
    await copyTable('inventorybrandmaster');
    await copyTable('inventoryunitmaster');
    await copyTable('inventoryitemmaster');
    await copyTable('inventoryitemvariant');
    await copyTable('inventoryvariantbarcode'); // Added Barcodes

    await copyTable('inventorystockin');
    await copyTable('inventorystockindetail');
    await copyTable('inventorystockinserial');

    // 3. Fix Missing Monitor variant stocks from modern tables
    try {
      const [details] = await source.query("SELECT stockInDetailId, itemVariantId, stockInQty, purchaseRate, unitPrice FROM inventorystockindetail WHERE itemVariantId IN ('2a884613-f8b2-429e-addb-f63611f1b763', '9ca82a1d-5285-4b93-90fc-2cda9f1e3967')");
      for (const d of details) {
         const [serials] = await dest.query("SELECT COUNT(*) as c FROM inventorystockinserial WHERE itemVariantId=? AND isSold=0 AND isDeleted=0 AND serialStatus='Available'", [d.itemVariantId]);
         const availablePCS = serials[0].c;
         const price = d.purchaseRate || d.unitPrice || 0;
         
         await dest.query(`
           INSERT INTO newdb.inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate, lastUpdatedOn) 
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE availablePCS = VALUES(availablePCS), avgPurchaseRate = VALUES(avgPurchaseRate), lastPurchaseRate = VALUES(lastPurchaseRate)
         `, [d.itemVariantId, availablePCS, price, price]);
         
         await dest.query("UPDATE newdb.inventorystockinserial SET landingPrice = ? WHERE itemVariantId = ?", [price, d.itemVariantId]);
      }
    } catch(e) {
      console.log('Skipped monitor fix:', e.message);
    }

    // Modernize Legacy Models
    const catId = uuidv4();
    const brandId = uuidv4();
    const printerItemId = uuidv4();

    await dest.query("INSERT IGNORE INTO newdb.inventorycategorymaster (categoryId, categoryName, companyGuid) VALUES (?, 'Printer', ?)", [catId, companyGuid]);
    await dest.query("INSERT IGNORE INTO newdb.inventorybrandmaster (brandId, brandName, companyGuid) VALUES (?, 'Legacy', ?)", [brandId, companyGuid]);
    await dest.query(`
      INSERT IGNORE INTO newdb.inventoryitemmaster 
      (itemId, categoryId, brandId, itemName, unitId, useSerialTab, companyGuid)
      VALUES (?, ?, ?, 'Legacy Printers', 'u_nos', 1, ?)
    `, [printerItemId, catId, brandId, companyGuid]);

    try {
      const [models] = await source.query("SELECT * FROM models");
      for (const m of models) {
        const variantId = m.guid;
        await dest.query(`
          INSERT IGNORE INTO newdb.inventoryitemvariant 
          (itemVariantId, itemId, variantName, sku, purchasePrice, sellingPrice, stockQty, status, isDeleted, createdAt, companyGuid)
          VALUES (?, ?, ?, ?, 0, ?, ?, 1, 0, NOW(), ?)
        `, [variantId, printerItemId, m.name, m.barcode || null, m.mrp || 0, m.stockQuantity || 0, companyGuid]);
      }
    } catch(e) {
      console.log('Skipped models:', e.message);
    }

    // Modernize Legacy Serials
    try {
      const [legacySerials] = await source.query("SELECT * FROM serials");
      let legacyCount = 0;
      for (const s of legacySerials) {
        const serialStatus = s.status === 'FBF' ? 'FBF' : (s.status === 'Damaged' ? 'Damaged' : (s.isSold || s.status === 'Dispatched' ? 'Sold' : 'Available'));
        const isSold = serialStatus === 'Sold' ? 1 : 0;
        
        if (s.value && s.modelGuid) {
          // Check for duplicate serial string
          const [exists] = await dest.query("SELECT COUNT(*) as c FROM newdb.inventorystockinserial WHERE serialNumber = ?", [s.value]);
          if(exists[0].c === 0) {
            await dest.query(`
              INSERT IGNORE INTO newdb.inventorystockinserial 
              (serialId, guid, itemVariantId, serialNumber, serialStatus, isSold, isDeleted, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [s.guid, s.guid, s.modelGuid, s.value, serialStatus, isSold, s.isDeleted || 0, s.createdAt || new Date()]);
            legacyCount++;
          }
        }
      }
      console.log(`Copied ${legacyCount} legacy serials`);
    } catch(e) {
      console.log('Skipped legacy serials:', e.message);
    }

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration Failed:", err);
  } finally {
    source.end();
    dest.end();
  }
}

migrate();
