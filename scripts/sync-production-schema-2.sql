-- Production schema sync #2
-- Everything added to the dev database since the last commit (7519022) that production does not have yet.
--
-- NOTE: the app creates all of this by itself the first time each feature is used (lazy "ensure..." migrations), as long as the
-- database user may CREATE / ALTER tables. Run this file only if you want it applied up-front, or the live DB user is restricted.
--
-- Safe to re-run: tables use IF NOT EXISTS. For every ALTER below, if MySQL answers
-- "Duplicate column name" / "Duplicate key name" that change is already there - skip that line and continue.
-- Run it on a COPY / after a backup first.

-- ============================================================
-- 1. NEW TABLES
-- ============================================================

-- Contract Groups
CREATE TABLE IF NOT EXISTS `contract_groups` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `matchFields` json DEFAULT NULL,
  `matchValues` json DEFAULT NULL,
  `clientGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customValues` json DEFAULT NULL,
  `createdBy` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isDeleted` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  KEY `idx_contract_groups_company` (`companyGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contract Groups
CREATE TABLE IF NOT EXISTS `contract_group_rows` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `groupGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sourceType` enum('contract','order') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sourceGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `productKey` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0',
  `sourceCompanyGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rowDate` date DEFAULT NULL,
  `firm` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contractNumber` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item` text COLLATE utf8mb4_unicode_ci,
  `orderQty` decimal(14,3) NOT NULL DEFAULT '0.000',
  `landingPrice` decimal(14,2) DEFAULT NULL,
  `qtyDelivered` decimal(14,3) NOT NULL DEFAULT '0.000',
  `orderAmount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `gstPct` decimal(5,2) NOT NULL DEFAULT '18.00',
  `commLabel` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sourceStatus` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sortOrder` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `commStatusGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission` decimal(14,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`guid`),
  UNIQUE KEY `uq_group_source` (`groupGuid`,`sourceType`,`sourceGuid`,`productKey`),
  KEY `idx_group_rows_group` (`groupGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contract Groups
CREATE TABLE IF NOT EXISTS `contract_group_removed` (
  `groupGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sourceGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `removedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`groupGuid`,`sourceGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contract Groups
CREATE TABLE IF NOT EXISTS `contract_group_columns` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('text','number','date','dropdown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
  `options` json DEFAULT NULL,
  `displayOrder` int NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contract Groups
CREATE TABLE IF NOT EXISTS `contract_group_commission_statuses` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'slate',
  `displayOrder` int NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Credentials
CREATE TABLE IF NOT EXISTS `credentials` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `passwordEnc` text COLLATE utf8mb4_unicode_ci,
  `url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `customFields` json DEFAULT NULL,
  `createdBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updatedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `passwordChangedAt` datetime DEFAULT NULL,
  `passwordChangedBy` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isDeleted` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  KEY `idx_credentials_company` (`companyGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Credentials
CREATE TABLE IF NOT EXISTS `credential_password_history` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `credentialGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `passwordEnc` text COLLATE utf8mb4_unicode_ci,
  `changedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  KEY `idx_cph_credential` (`credentialGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily Tasks
CREATE TABLE IF NOT EXISTS `daily_tasks` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `userGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `taskDate` date NOT NULL,
  `task` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `screenshotFilename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `screenshotAt` datetime DEFAULT NULL,
  `isDeleted` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `customValues` json DEFAULT NULL,
  PRIMARY KEY (`guid`),
  KEY `idx_daily_tasks_user_date` (`userGuid`,`taskDate`),
  KEY `idx_daily_tasks_company_date` (`companyGuid`,`taskDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily Tasks
CREATE TABLE IF NOT EXISTS `daily_task_columns` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('text','number','date','dropdown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
  `options` json DEFAULT NULL,
  `displayOrder` int NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`guid`),
  KEY `idx_dtc_company` (`companyGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks
CREATE TABLE IF NOT EXISTS `tasks` (
  `guid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `companyGuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('Low','Medium','High') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Medium',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `deadline` datetime DEFAULT NULL,
  `assignedBy` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relatedType` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relatedId` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachmentFilename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completedAt` datetime DEFAULT NULL,
  `overdueNotifiedAt` datetime DEFAULT NULL,
  `isDeleted` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `tags` json DEFAULT NULL,
  `dueSoonNotifiedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`guid`),
  KEY `idx_tasks_assignedBy` (`assignedBy`),
  KEY `idx_tasks_company` (`companyGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks
CREATE TABLE IF NOT EXISTS `task_assignees` (
  `taskGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userGuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`taskGuid`,`userGuid`),
  KEY `idx_task_assignees_user` (`userGuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. NEW COLUMNS ON EXISTING TABLES
-- ============================================================
-- Due Purchase Bill switch (Company Master)
ALTER TABLE `companies` ADD COLUMN `dueBillEnabled` tinyint(1) NOT NULL DEFAULT '0';
-- Due Purchase Bill
ALTER TABLE `inventorystockin` ADD COLUMN `isDue` tinyint(1) NOT NULL DEFAULT '0';
-- Due Purchase Bill
ALTER TABLE `inventorystockin` ADD COLUMN `isRoundOff` tinyint(1) NOT NULL DEFAULT '0';
-- Optional Delivered Date with POD
ALTER TABLE `order_logistics` ADD COLUMN `deliveredDate` date NULL DEFAULT NULL;
-- Per-platform Warranty switch
ALTER TABLE `selling_platforms` ADD COLUMN `warrantyEnabled` tinyint(1) NOT NULL DEFAULT '0';
-- Per-user access overrides
ALTER TABLE `users` ADD COLUMN `extraPermissions` json NULL DEFAULT NULL;
-- Per-user access overrides
ALTER TABLE `users` ADD COLUMN `blockedPermissions` json NULL DEFAULT NULL;
-- Per-user access overrides
ALTER TABLE `users` ADD COLUMN `extraEditPermissions` json NULL DEFAULT NULL;
-- Per-user access overrides
ALTER TABLE `users` ADD COLUMN `blockedEditPermissions` json NULL DEFAULT NULL;

-- Task / Daily Task / Contract Groups tables above already contain their later columns (remarks, tags, customValues, commStatusGuid, commission).
-- Task due-soon reminders: tasks.dueSoonNotifiedAt is already inside the CREATE TABLE above. Only if the `tasks` table already
-- existed WITHOUT it, run:  ALTER TABLE `tasks` ADD COLUMN `dueSoonNotifiedAt` datetime NULL DEFAULT NULL;
--
-- !! DO NOT add these two columns by hand:  roles.dashWidgetsMigrated  and  roles.dashSectionsMigrated
-- !! The app adds them itself on the first login after deploy AND, in that same step, gives every existing role the matching
-- !! dashboard permissions (dash_orders, dash_dispatch, ...). If the columns already exist, that backfill is skipped and
-- !! non-Admin users would lose their Dashboard cards/charts/widgets until you tick them again in Manage Roles.
-- Keep GeM in the Warranty tab (run once, right after the warrantyEnabled column was added):
UPDATE `selling_platforms` SET `warrantyEnabled` = 1 WHERE LOWER(`name`) LIKE '%gem%';

-- ============================================================
-- 3. NEW INDEXES (speeds up stock / serial lookups)
-- ============================================================
CREATE INDEX idx_serial_variant_status ON inventorystockinserial (itemVariantId, serialStatus, isDeleted);
CREATE INDEX idx_serial_company_status ON inventorystockinserial (companyGuid, serialStatus);

-- ============================================================
-- 4. Per-company Unit / FBF-FBA masters (existing file, run once if not already applied on live)
-- ============================================================
-- scripts/migrate_add_companyguid_unit_fbf.sql
--   adds companyGuid to inventoryunitmaster, fbf_fba_warehouses, fbf_fba_platforms, fbf_fba_states.
--   !! It hard-codes the primary company guid on its first line (SET @primaryCompany = '...'):
--   !! change it to YOUR LIVE "A PLUS DIGITAL SOLUTIONS" companies.guid before running.
