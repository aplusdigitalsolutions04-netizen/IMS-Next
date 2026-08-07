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
