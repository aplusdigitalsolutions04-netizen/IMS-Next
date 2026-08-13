// One-off: inventoryitemvariant.purchasePrice was never updated by
// FinalizeStockIn (fixed in app/Inventory/FinalizeStockIn/route.js), so
// existing variants are stuck at 0/NULL even though real purchase rates
// exist in inventoryvariantstock.lastPurchaseRate. Backfills those.
require("dotenv").config({ path: ".env.local" });
const mysql = require("mysql2/promise");

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [result] = await c.query(`
      UPDATE inventoryitemvariant iv
      JOIN inventoryvariantstock s ON iv.itemVariantId = s.itemVariantId
      SET iv.purchasePrice = s.lastPurchaseRate
      WHERE (iv.purchasePrice IS NULL OR iv.purchasePrice = 0) AND s.lastPurchaseRate > 0
    `);
    console.log(`Backfilled purchasePrice for ${result.affectedRows} item variant(s).`);
  } finally {
    await c.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
