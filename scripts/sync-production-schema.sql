-- Production schema sync script
-- Applies every schema/data change made against the dev database during
-- this session that production is still missing. Safe to run more than
-- once (uses IF NOT EXISTS / INSERT IGNORE / ON DUPLICATE KEY UPDATE
-- throughout) — if a specific statement errors with "already exists" or
-- "Duplicate", that particular change is already applied; skip it and
-- continue with the rest.

-- ── 1. selling_platforms (Selling Platforms / Platform Master feature) ──────
CREATE TABLE IF NOT EXISTS `selling_platforms` (
  `guid` char(36) NOT NULL,
  `name` varchar(50) NOT NULL,
  `colorTheme` varchar(20) NOT NULL DEFAULT 'slate',
  `sortOrder` int NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `isSystem` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `selling_platforms` (`guid`, `name`, `colorTheme`, `sortOrder`, `isActive`, `isSystem`) VALUES
  (UUID(), 'GeM',      'emerald', 1, 1, 1),
  (UUID(), 'Flipkart', 'blue',    2, 1, 1),
  (UUID(), 'Amazon',   'amber',   3, 1, 1),
  (UUID(), 'Other',    'violet',  4, 1, 1);

-- ── 2. rate_limit_rules (API Rate Limiting feature) ─────────────────────────
CREATE TABLE IF NOT EXISTS `rate_limit_rules` (
  `guid` char(36) NOT NULL,
  `ruleKey` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `windowMs` int NOT NULL,
  `maxRequests` int NOT NULL,
  `updatedBy` varchar(100) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  UNIQUE KEY `ruleKey` (`ruleKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `rate_limit_rules` (`guid`, `ruleKey`, `label`, `windowMs`, `maxRequests`) VALUES
  (UUID(), 'login',   'Login attempts',    900000, 8),
  (UUID(), 'signup',  'Signup requests',   3600000, 5),
  (UUID(), 'general', 'All API requests',  60000, 300)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ── 3. app_settings (Admin-configurable settings, e.g. E-Way Bill threshold) ─
CREATE TABLE IF NOT EXISTS `app_settings` (
  `guid` char(36) NOT NULL,
  `settingKey` varchar(100) NOT NULL,
  `label` varchar(150) NOT NULL,
  `settingValue` varchar(255) NOT NULL,
  `valueType` enum('number','string','boolean') NOT NULL DEFAULT 'string',
  `description` varchar(500) DEFAULT NULL,
  `updatedBy` varchar(100) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  UNIQUE KEY `settingKey` (`settingKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `app_settings` (`guid`, `settingKey`, `label`, `settingValue`, `valueType`, `description`) VALUES
  (UUID(), 'eway_bill_threshold', 'E-Way Bill Threshold', '50000', 'number', 'Order value (in Rs.) above which an E-Way Bill becomes mandatory before dispatch/billing.');

-- ── 4. warranty_template.signatureImagePath (Signature & Stamp feature) ─────
-- Requires MySQL 8.0.29+ for "ADD COLUMN IF NOT EXISTS". If your MySQL is
-- older and this errors, run just `ALTER TABLE warranty_template ADD COLUMN
-- signatureImagePath VARCHAR(255) NULL AFTER headerImagePath;` instead —
-- but only if the column doesn't already exist (check with `SHOW COLUMNS
-- FROM warranty_template;` first).
ALTER TABLE `warranty_template`
  ADD COLUMN IF NOT EXISTS `signatureImagePath` VARCHAR(255) NULL AFTER `headerImagePath`;

-- ── 5. payments unique constraint (duplicate-payment race-condition fix) ───
-- No IF NOT EXISTS for constraints in MySQL — if this errors with
-- "Duplicate key name 'uq_payments_dispatch_company'", it's already applied,
-- skip this statement.
ALTER TABLE `payments`
  ADD CONSTRAINT `uq_payments_dispatch_company` UNIQUE (`dispatchGuid`, `companyGuid`);

-- ── 6. drive_files (Google Drive-backed uploads) ────────────────────────────
-- Maps the same `filename` string that's always been stored in
-- orders/order_items/order_logistics/orderdocuments/etc. to the Google Drive
-- file it now actually lives in. app/uploads/[filename] checks disk first
-- (old uploads stay put there), then falls back to this table + Drive.
CREATE TABLE IF NOT EXISTS `drive_files` (
  `filename` varchar(255) NOT NULL,
  `driveFileId` varchar(100) NOT NULL,
  `mimetype` varchar(100) DEFAULT NULL,
  `size` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. Category-defined item specifications (replaces hardcoded Monitor/PC/
-- Printer spec fields on the Item Variant form) ─────────────────────────────
-- `dropdown_master` already existed (used only for the generic COMPANY
-- dropdown). It's extended here so a row can also represent a
-- category-scoped specification: `categoryId` + `companyGuid` scope it to one
-- category, `fieldType` says whether the Item Variant form should render a
-- <select> (options live in `dropdown_option`, unchanged) or a free-text
-- <textarea> (no options rows). Existing COMPANY-dropdown rows are untouched
-- (categoryId/companyGuid stay NULL for them).
-- NOTE: no IF NOT EXISTS here — combining it with AFTER/MODIFY in one ALTER
-- errors even on MySQL 8.0.45 (tested). Run once; a re-run errors with
-- "Duplicate column name" — that means it's already applied, skip it.
ALTER TABLE `dropdown_master`
  ADD COLUMN `companyGuid` char(36) NULL AFTER `id`,
  ADD COLUMN `categoryId` char(36) NULL AFTER `dropdown_code`,
  ADD COLUMN `fieldType` enum('DROPDOWN','TEXTAREA') NOT NULL DEFAULT 'DROPDOWN' AFTER `dropdown_name`,
  ADD COLUMN `displayOrder` int NOT NULL DEFAULT '0' AFTER `fieldType`,
  MODIFY COLUMN `dropdown_code` varchar(100) NULL;

-- No IF NOT EXISTS for index add either — if this errors with "Duplicate key
-- name 'idx_dropdown_master_category'", it's already applied, skip it.
ALTER TABLE `dropdown_master`
  ADD INDEX `idx_dropdown_master_category` (`categoryId`);

-- Per item-variant value for a category specification. `specificationId`
-- points at a `dropdown_master` row (the spec definition); `value` holds
-- either the free-typed TEXTAREA text or the chosen DROPDOWN option_value.
CREATE TABLE IF NOT EXISTS `inventoryitemvariantspecvalue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyGuid` char(36) NOT NULL,
  `itemVariantId` char(36) NOT NULL,
  `specificationId` int NOT NULL,
  `value` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_variant_spec` (`itemVariantId`, `specificationId`),
  KEY `idx_specvalue_variant` (`itemVariantId`),
  KEY `idx_specvalue_spec` (`specificationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SaveOrUpdateCategorySpecification originally forgot to set `guid` and
-- `dropdown_code` (both pre-existing UNIQUE columns on dropdown_master) when
-- inserting a new category specification, leaving them NULL. Fixed in the
-- route, but backfill any rows already created before that fix shipped.
-- UUID() is evaluated per row, so each backfilled row gets a distinct value.
-- Safe to re-run.
UPDATE `dropdown_master` SET `guid` = UUID() WHERE `guid` IS NULL;
UPDATE `dropdown_master` SET `dropdown_code` = CONCAT('CATSPEC_', UUID()) WHERE `dropdown_code` IS NULL AND `categoryId` IS NOT NULL;

-- ── N. Contract upload: seller company/GST verification + delivery instructions ──
-- MySQL doesn't support `ADD COLUMN IF NOT EXISTS`, so guard with a
-- prepared-statement no-op when the column is already there (safe to re-run).
SET @stmt := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'companies' AND column_name = 'gstNumber') = 0,
  'ALTER TABLE companies ADD COLUMN gstNumber varchar(20) DEFAULT NULL AFTER name',
  'SELECT 1'
));
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contracts' AND column_name = 'deliveryInstructions') = 0,
  'ALTER TABLE contracts ADD COLUMN deliveryInstructions text DEFAULT NULL',
  'SELECT 1'
));
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── N+1. Manage Roles: new permissions (Godown Transfer / Manage Roles /
-- User Activity) + real Add/Edit/Delete split for Roles, Company Master,
-- Selling Platforms, User Management, Email Accounts, Email Templates ──────
-- No schema change (roles.permissions / roles.editPermissions are already
-- JSON columns) — after deploying, run this against production so existing
-- roles keep the access they already had under the old, coarser checks:
--   node scripts/backfill_role_permissions.js

-- ── N+2. inventoryitemvariant.purchasePrice was never written by
-- FinalizeStockIn (fixed in app/Inventory/FinalizeStockIn/route.js), leaving
-- it stuck at 0 while landingPrice/lastPurchaseRate moved normally. No
-- schema change — after deploying, backfill existing variants:
--   node scripts/backfill_purchase_price.js
