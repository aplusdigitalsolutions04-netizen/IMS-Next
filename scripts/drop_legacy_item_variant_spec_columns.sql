-- Run this ONLY after:
--   1. scripts/sync-production-schema.sql (section 7) has been applied, AND
--   2. `node -r dotenv/config scripts/migrate_category_specifications.js` has
--      run successfully AND you've verified in the app (Item Variant form,
--      "models" export) that specification values now show up correctly via
--      the new dropdown_master / inventoryitemvariantspecvalue tables.
--
-- This is irreversible — back up inventoryitemvariant first if in doubt.

ALTER TABLE `inventoryitemvariant`
  DROP COLUMN `colorType`,
  DROP COLUMN `printerType`,
  DROP COLUMN `cpu`,
  DROP COLUMN `ram`,
  DROP COLUMN `ssdHdd`,
  DROP COLUMN `screenSize`,
  DROP COLUMN `resolution`,
  DROP COLUMN `panelType`,
  DROP COLUMN `refreshRate`,
  DROP COLUMN `packagingCost`,
  DROP COLUMN `packageLength`,
  DROP COLUMN `packageWidth`,
  DROP COLUMN `packageHeight`,
  DROP COLUMN `packageWeight`;

-- Optional cleanup — the old per-type master tables and their standalone
-- admin screens have been removed from the app (superseded by Category
-- Master → Specifications). Safe to drop once you've confirmed the migration
-- copied everything you need into dropdown_master/dropdown_option.
-- DROP TABLE IF EXISTS `inventorycolortypemaster`;
-- DROP TABLE IF EXISTS `inventoryprintertypemaster`;
