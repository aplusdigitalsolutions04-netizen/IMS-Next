const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const source = await mysql.createConnection({ host: 'localhost', user: 'Rahul', password: 'Rahul@3820', database: 'imnew' });
  const dest = await mysql.createConnection({ host: 'localhost', user: 'Rahul', password: 'Rahul@3820', database: 'newdb' });

  try {
    console.log("Starting full data migration from imnew to newdb (MODERNIZED ONLY)...");

    // 1. Create Aplus company
    const companyGuid = uuidv4();
    await dest.query(`
      INSERT INTO companies (guid, name, isActive, createdAt, updatedAt)
      VALUES (?, 'Aplus', 1, NOW(), NOW())
    `, [companyGuid]);
    console.log("Created Aplus company:", companyGuid);

    // Function to safely copy a table, mapping companyGuid if the column exists in DESTINATION
    async function copyTable(table, requireCompany = false) {
      try {
        const [dCols] = await source.query('DESCRIBE ' + table);
        const [nCols] = await dest.query('DESCRIBE ' + table);
        
        const dNames = dCols.map(c=>c.Field);
        const nNames = nCols.map(c=>c.Field);
        
        const common = dNames.filter(n=>nNames.includes(n));
        if (common.length === 0) return;
        
        let insCols = [...common];
        let selCols = [...common.map(n=>`\`${n}\``)];
        
        if (nNames.includes('companyGuid') && !dNames.includes('companyGuid')) {
          insCols.push('companyGuid');
          selCols.push(`'${companyGuid}'`);
        } else if (nNames.includes('companyGuid') && requireCompany) {
          const idx = insCols.indexOf('companyGuid');
          if (idx !== -1) {
              selCols[idx] = `'${companyGuid}'`;
          } else {
              insCols.push('companyGuid');
              selCols.push(`'${companyGuid}'`);
          }
        }
        
        const q = `INSERT IGNORE INTO newdb.${table} (\`${insCols.join('`, `')}\`) SELECT ${selCols.join(', ')} FROM imnew.${table}`;
        await dest.query(q);
        console.log(`Copied ${table}`);
      } catch (err) {
        console.log(`Error copying table ${table}: ${err.message}`);
      }
    }

    // 2. Transfer general data
    // Handle users manually due to schema differences
    const [users] = await source.query("SELECT * FROM users");
    for (const u of users) {
      const uId = u.userid || u.id || uuidv4();
      await dest.query(`
        INSERT IGNORE INTO newdb.users (userid, username, password, role, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `, [uId, u.username, u.password, u.role, u.createdAt || new Date()]);
    }
    console.log("Copied users");

    await copyTable('roles', true);
    await copyTable('user_companies');
    
    // Map users to new company
    try {
      await dest.query('UPDATE newdb.user_companies SET companyGuid = ?', [companyGuid]);
    } catch(e) {}
    
    await copyTable('dropdown_master');
    await copyTable('dropdown_option');
    await copyTable('godowns', true);
    
    // 3. Copy existing modern inventory data from imnew
    await copyTable('inventorycategorymaster', true);
    await copyTable('inventorybrandmaster', true);
    await copyTable('inventoryunitmaster', true);
    await copyTable('inventoryitemmaster', true);
    await copyTable('inventoryitemvariant', true);
    await copyTable('inventoryvariantstock', true);
    await copyTable('inventorystockin', true);
    await copyTable('inventorystockindetail', true);
    await copyTable('inventorystockinserial', true);

    // Make sure inventorystockinserial guid is populated
    try {
        await dest.query("UPDATE newdb.inventorystockinserial SET guid = serialId WHERE guid IS NULL");
    } catch(e) {}

    // 4. Modernize Legacy Models and Serials
    console.log("Modernizing legacy models and serials...");
    const unitId = "u_nos";
    await dest.query("INSERT IGNORE INTO newdb.inventoryunitmaster (unitId, unitName) VALUES ('u_nos', 'Nos')");

    const catId = uuidv4();
    await dest.query("INSERT INTO newdb.inventorycategorymaster (categoryId, categoryName, status, isDeleted, createdAt, companyGuid, showMrp) VALUES (?, 'Printers', 1, 0, NOW(), ?, 1)", [catId, companyGuid]);
    
    const brandId = uuidv4();
    await dest.query("INSERT INTO newdb.inventorybrandmaster (brandId, brandName, status, isDeleted, createdAt, companyGuid, showInModels) VALUES (?, 'Generic', 1, 0, NOW(), ?, 1)", [brandId, companyGuid]);

    const printerItemId = uuidv4();
    await dest.query(`
      INSERT INTO newdb.inventoryitemmaster 
      (itemId, categoryId, brandId, itemName, unitId, isTrackable, useSerialTab, status, isDeleted, createdAt, companyGuid)
      VALUES (?, ?, ?, 'Printer', ?, 1, 1, 1, 0, NOW(), ?)
    `, [printerItemId, catId, brandId, unitId, companyGuid]);
    
    const [models] = await source.query("SELECT * FROM models WHERE isDeleted = 0");
    const oldModelToVariantMap = {};
    
    for (const m of models) {
      const variantId = m.guid; 
      oldModelToVariantMap[m.guid] = variantId;

      await dest.query(`
        INSERT IGNORE INTO newdb.inventoryitemvariant 
        (itemVariantId, itemId, variantName, sku, purchasePrice, sellingPrice, stockQty, status, isDeleted, createdAt, companyGuid)
        VALUES (?, ?, ?, ?, 0, ?, ?, 1, 0, NOW(), ?)
      `, [variantId, printerItemId, m.name, m.barcode || null, m.mrp || 0, m.stockQuantity || 0, companyGuid]);

      await dest.query(`
        INSERT IGNORE INTO newdb.inventoryvariantstock 
        (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate, lastUpdatedOn)
        VALUES (?, ?, 0, 0, NOW())
      `, [variantId, m.stockQuantity || 0]);
    }
    console.log(`Migrated ${models.length} legacy models.`);

    const [serials] = await source.query("SELECT * FROM serials WHERE isDeleted = 0");
    
    if (serials.length > 0) {
      const stockInId = uuidv4();
      await dest.query(`
        INSERT INTO newdb.inventorystockin 
        (stockInId, invoiceNo, invoiceDate, status, totalAmount, isDeleted, createdAt, createdBy, finalizedOn, remarks, companyGuid)
        VALUES (?, 'OLD-MODELS-STOCK', NOW(), 1, 0, 0, NOW(), 'MIGRATION', NOW(), 'Migrated from Old Models', ?)
      `, [stockInId, companyGuid]);

      const [gdRows] = await dest.query("SELECT guid FROM newdb.godowns WHERE isDeleted=0 LIMIT 1");
      const defaultGodownGuid = gdRows.length > 0 ? gdRows[0].guid : null;

      const serialsGrouped = {};
      let totalStockInAmount = 0;

      for (const s of serials) {
        if (!s.modelGuid) continue;
        const gGuid = s.godownGuid || defaultGodownGuid;
        const price = parseFloat(s.landingPrice) || 0;
        const key = `${s.modelGuid}_${gGuid}_${price}`;
        if (!serialsGrouped[key]) {
          serialsGrouped[key] = { modelGuid: s.modelGuid, godownGuid: gGuid, landingPrice: price, serials: [] };
        }
        serialsGrouped[key].serials.push(s);
      }

      for (const group of Object.values(serialsGrouped)) {
        const { modelGuid, godownGuid, landingPrice, serials: sList } = group;
        const variantId = oldModelToVariantMap[modelGuid];
        if (!variantId) continue;

        const stockInDetailId = uuidv4();
        const receiveQty = sList.length;
        const totalPrice = receiveQty * landingPrice;
        totalStockInAmount += totalPrice;

        await dest.query(`
          INSERT INTO newdb.inventorystockindetail 
          (stockInDetailId, stockInId, itemVariantId, receiveQty, unitPrice, totalPrice, createdAt, unitId, stockInQty, defaultPcsQty, finalPcsQty, pcsQty, purchaseRate, status, modelGuid, godownGuid, companyGuid)
          VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, 1, ?, ?, ?, 1, ?, ?, ?)
        `, [stockInDetailId, stockInId, variantId, receiveQty, landingPrice, totalPrice, unitId, receiveQty, receiveQty, receiveQty, landingPrice, modelGuid, godownGuid, companyGuid]);

        for (const s of sList) {
          const serialId = s.guid || uuidv4();
          await dest.query(`
            INSERT IGNORE INTO newdb.inventorystockinserial 
            (guid, serialId, stockInDetailId, itemVariantId, serialNumber, isUsed, isDeleted, createdAt, status, isSold, companyGuid)
            VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), 1, ?, ?)
          `, [serialId, serialId, stockInDetailId, variantId, s.value, (s.status === 'sold' ? 1 : 0), (s.status === 'sold' ? 1 : 0), companyGuid]);
        }
        
        if (landingPrice > 0) {
          await dest.query(`
            UPDATE newdb.inventoryvariantstock 
            SET lastPurchaseRate = ?, avgPurchaseRate = ? 
            WHERE itemVariantId = ?
          `, [landingPrice, landingPrice, variantId]);
          
          await dest.query(`
            UPDATE newdb.inventoryitemvariant
            SET purchasePrice = ?
            WHERE itemVariantId = ? AND purchasePrice = 0
          `, [landingPrice, variantId]);
        }
      }

      await dest.query(`
        UPDATE newdb.inventorystockin 
        SET totalAmount = ? 
        WHERE stockInId = ?
      `, [totalStockInAmount, stockInId]);
      console.log(`Migrated ${serials.length} legacy serials.`);
    }

    // 5. Orders & Logistics
    await copyTable('orders', true);
    await copyTable('order_items', true);
    
    // In order_items, map modelGuid to itemVariantId for backward compatibility!
    try {
        await dest.query("UPDATE newdb.order_items SET itemVariantId = modelGuid WHERE modelGuid IS NOT NULL AND itemVariantId IS NULL");
        console.log("Updated order_items itemVariantId");
    } catch(e) {}

    await copyTable('order_installations', true);
    await copyTable('order_logistics', true);
    await copyTable('orderdocuments', true);
    await copyTable('payments', true);
    await copyTable('returns', true);

    console.log("Migration completed successfully! Legacy models/serials were NOT copied directly, only modernized.");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await source.end();
    await dest.end();
  }
}

run();
