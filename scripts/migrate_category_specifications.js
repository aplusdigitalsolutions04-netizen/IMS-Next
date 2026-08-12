// One-time data migration: copies legacy Item Variant column values (from the
// old hardcoded Monitor/PC/Printer fields) into inventoryitemvariantspecvalue
// — but ONLY for specifications that already exist, i.e. that an admin has
// manually created for that category via Category Master → Specifications
// with a matching name (see NAME_TO_LEGACY_COLUMN below). This script never
// creates dropdown_master rows itself — no specification shows up anywhere
// unless an admin explicitly added it first. Category "buckets" (Monitor/PC/
// Printer name-sniffing) are gone entirely; this is a flat name lookup.
//
// For "Color Type" / "Printer Type" specs specifically, if the admin created
// them as DROPDOWN, this also copies that company's legacy
// inventorycolortypemaster / inventoryprintertypemaster option lists into
// dropdown_option under the matching spec (so old option values aren't lost),
// then migrates each variant's legacy value the same way as any other spec.
//
// Run AFTER applying scripts/sync-production-schema.sql (section 7), and
// after manually creating whichever of these specs you actually want, via
// Category Master → Specifications, for whichever categories need them.
// Then run this BEFORE scripts/drop_legacy_item_variant_spec_columns.sql.
//
//   node -r dotenv/config scripts/migrate_category_specifications.js
//
// Idempotent: re-running skips options that already exist and overwrites
// spec values via ON DUPLICATE KEY UPDATE.

const mysql = require("mysql2/promise");

// Name an admin-created specification exactly this (case-sensitive) for its
// legacy column value to be picked up. Not applied automatically to any
// category — only matched against specs that already exist.
const KNOWN_SPECS = [
  { name: "Color Type", legacyColumn: "colorType", legacyMasterTable: "inventorycolortypemaster", legacyMasterNameCol: "colorTypeName" },
  { name: "Printer Type", legacyColumn: "printerType", legacyMasterTable: "inventoryprintertypemaster", legacyMasterNameCol: "printerTypeName" },
  { name: "CPU / Processor", legacyColumn: "cpu" },
  { name: "RAM", legacyColumn: "ram" },
  { name: "SSD / HDD", legacyColumn: "ssdHdd" },
  { name: "Screen Size", legacyColumn: "screenSize" },
  { name: "Resolution", legacyColumn: "resolution" },
  { name: "Panel Type", legacyColumn: "panelType" },
  { name: "Refresh Rate", legacyColumn: "refreshRate" },
];

async function main() {
  const pool = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let optionsCreated = 0, valuesCopied = 0;

  try {
    const [companies] = await pool.query(
      "SELECT DISTINCT companyGuid FROM inventorycategorymaster WHERE isDeleted = 0"
    );

    for (const { companyGuid } of companies) {
      const [categories] = await pool.query(
        "SELECT categoryId, categoryName FROM inventorycategorymaster WHERE isDeleted = 0 AND companyGuid = ?",
        [companyGuid]
      );

      for (const category of categories) {
        // Only act on specs the admin already created for this category —
        // never create dropdown_master rows here.
        const [existingSpecs] = await pool.query(
          "SELECT id, dropdown_name, fieldType FROM dropdown_master WHERE companyGuid = ? AND categoryId = ? AND is_active = 1",
          [companyGuid, category.categoryId]
        );
        const activeDefs = KNOWN_SPECS
          .map((known) => ({ ...known, existing: existingSpecs.find((s) => s.dropdown_name === known.name) }))
          .filter((d) => d.existing);
        if (!activeDefs.length) continue;

        for (const def of activeDefs) {
          def.specificationId = def.existing.id;
          if (def.legacyMasterTable && def.existing.fieldType === "DROPDOWN") {
            const [legacyOptions] = await pool.query(
              `SELECT ${def.legacyMasterNameCol} AS name FROM ${def.legacyMasterTable} WHERE isDeleted = 0 AND companyGuid = ?`,
              [companyGuid]
            );
            for (const { name } of legacyOptions) {
              if (!name) continue;
              const [[existingOption]] = await pool.query(
                "SELECT id FROM dropdown_option WHERE dropdown_id = ? AND option_value = ?",
                [def.specificationId, name]
              );
              if (!existingOption) {
                await pool.execute(
                  "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, is_active) VALUES (UUID(), ?, ?, ?, 1)",
                  [def.specificationId, name, name]
                );
                optionsCreated++;
              }
            }
          }
        }

        const [variants] = await pool.query(
          `SELECT itemVariantId, colorType, printerType, cpu, ram, ssdHdd, screenSize, resolution, panelType, refreshRate
           FROM inventoryitemvariant v
           JOIN inventoryitemmaster i ON v.itemId = i.itemId
           WHERE v.isDeleted = 0 AND v.companyGuid = ? AND i.categoryId = ?`,
          [companyGuid, category.categoryId]
        );

        for (const variant of variants) {
          for (const def of activeDefs) {
            const rawValue = variant[def.legacyColumn];
            const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
            if (!value) continue;

            if (def.existing.fieldType === "DROPDOWN") {
              const [[option]] = await pool.query(
                "SELECT option_value FROM dropdown_option WHERE dropdown_id = ? AND option_value = ?",
                [def.specificationId, value]
              );
              if (!option) {
                await pool.execute(
                  "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, is_active) VALUES (UUID(), ?, ?, ?, 1)",
                  [def.specificationId, value, value]
                );
                optionsCreated++;
              }
            }

            await pool.execute(
              `INSERT INTO inventoryitemvariantspecvalue (companyGuid, itemVariantId, specificationId, value)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE value = VALUES(value)`,
              [companyGuid, variant.itemVariantId, def.specificationId, value]
            );
            valuesCopied++;
          }
        }
      }
    }

    console.log(`Done. Options created: ${optionsCreated}, variant values copied: ${valuesCopied}.`);
    console.log("Any legacy field with no matching admin-created specification for its category was left untouched (not migrated).");
    console.log("Verify the data in the app, then run scripts/drop_legacy_item_variant_spec_columns.sql to drop the old columns.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
