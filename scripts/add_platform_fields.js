const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({host:'localhost', user:'Rahul', password:'Rahul@3820', database:'newdb'});
  try {
    // 1. Lock existing built-ins
    await c.query(`UPDATE selling_platforms SET isSystem = 1 WHERE name IN ('Gem', 'Amazon', 'Flipkart', 'Other')`);
    console.log('Locked built-in platforms.');

    // 2. Create selling_platform_fields table
    await c.query(`
      CREATE TABLE IF NOT EXISTS selling_platform_fields (
        guid CHAR(36) PRIMARY KEY,
        platformGuid CHAR(36) NOT NULL,
        fieldName VARCHAR(100) NOT NULL,
        fieldType VARCHAR(50) NOT NULL DEFAULT 'text',
        isRequired TINYINT(1) DEFAULT 0,
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (platformGuid) REFERENCES selling_platforms(guid) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Created selling_platform_fields table.');

    // 3. Add platformFields column to orders
    try {
      await c.query(`ALTER TABLE orders ADD COLUMN platformFields JSON DEFAULT NULL`);
      console.log('Added platformFields column to orders.');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('platformFields column already exists in orders.');
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    c.end();
  }
}
run();
