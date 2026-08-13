// One-off: adds companies.gstNumber (for contract seller-company/GST
// verification on upload) and contracts.deliveryInstructions.
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
    await addColumnIfMissing(c, "companies", "gstNumber", "ALTER TABLE companies ADD COLUMN gstNumber varchar(20) DEFAULT NULL AFTER name");
    await addColumnIfMissing(c, "contracts", "deliveryInstructions", "ALTER TABLE contracts ADD COLUMN deliveryInstructions text DEFAULT NULL");
  } finally {
    await c.end();
  }
}

async function addColumnIfMissing(c, table, column, alterSql) {
  const [rows] = await c.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column]
  );
  if (rows[0].n > 0) {
    console.log(`${table}.${column} already exists`);
    return;
  }
  await c.query(alterSql);
  console.log(`${table}.${column} added`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
