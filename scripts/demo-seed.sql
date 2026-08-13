BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* =========================================================
   CLEAN OLD DEMO DATA
========================================================= */

DELETE FROM bb_notification
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_report_export
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_waste_tracking_submission
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_waste_receipt_item
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_waste_receipt
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_incident
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_waste_event
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_carrier_assignment
WHERE id LIKE 'demo-assignment-%';

DELETE FROM bb_bids
WHERE "listingId" BETWEEN 900001 AND 900099;

DELETE FROM bb_waste_listing
WHERE id BETWEEN 900001 AND 900099;

DELETE FROM bb_user_profile
WHERE "userId" IN (
  'demo-user-solo',
  'demo-user-generator',
  'demo-user-carrier',
  'demo-user-manager',
  'demo-user-enterprise'
);

DELETE FROM bb_user
WHERE id IN (
  'demo-user-solo',
  'demo-user-generator',
  'demo-user-carrier',
  'demo-user-manager',
  'demo-user-enterprise'
)
OR email LIKE 'demo.%@wastex.test';

DELETE FROM bb_departments
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_sites
WHERE "organisationId" IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

DELETE FROM bb_organisation
WHERE id IN (
  'demo-org-solo',
  'demo-org-greenbuild',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  'demo-org-civilsone'
);

/* =========================================================
   ORGANISATIONS
========================================================= */

INSERT INTO bb_organisation (
  id,
  "teamName",
  "profilePicture",
  capabilities,
  "operatingMode",
  industry,
  telephone,
  "emailAddress",
  country,
  "streetAddress",
  city,
  region,
  "postCode",
  "isSuspended",
  "subscriptionStatus",
  "subscriptionPlan",
  "trialEndsAt",
  "billingEmail",
  status,
  "approvedAt",
  "createdAt"
)
VALUES
(
  'demo-org-solo',
  'Solo Renovations Ltd',
  NULL,
  ARRAY['generator'],
  'solo',
  'Small renovation contractor',
  '01632 960001',
  'hello+solo@wastex.test',
  'United Kingdom',
  '12 Market Street',
  'Cambridge',
  'Cambridgeshire',
  'CB1 1AA',
  false,
  'trial',
  'starter',
  now() + interval '21 days',
  'billing+solo@wastex.test',
  'ACTIVE',
  now() - interval '20 days',
  now() - interval '22 days'
),
(
  'demo-org-greenbuild',
  'GreenBuild Construction Ltd',
  NULL,
  ARRAY['generator','manager'],
  'team',
  'Construction and demolition',
  '01632 960002',
  'ops+greenbuild@wastex.test',
  'United Kingdom',
  '88 Riverside Business Park',
  'Cambridge',
  'Cambridgeshire',
  'CB4 2AA',
  false,
  'active',
  'pro',
  now() + interval '60 days',
  'billing+greenbuild@wastex.test',
  'ACTIVE',
  now() - interval '40 days',
  now() - interval '45 days'
),
(
  'demo-org-orange-skip',
  'Orange Skip Logistics Ltd',
  NULL,
  ARRAY['carrier'],
  'carrier_ops',
  'Skip hire and waste transport',
  '01632 960003',
  'dispatch+orange@wastex.test',
  'United Kingdom',
  '4 Haulage Road',
  'Ipswich',
  'Suffolk',
  'IP1 4SK',
  false,
  'active',
  'pro',
  now() + interval '60 days',
  'billing+orange@wastex.test',
  'ACTIVE',
  now() - interval '35 days',
  now() - interval '38 days'
),
(
  'demo-org-apex-recovery',
  'Apex Recovery & Recycling Ltd',
  NULL,
  ARRAY['manager','carrier'],
  'multi_site',
  'Waste recovery and recycling',
  '01632 960004',
  'compliance+apex@wastex.test',
  'United Kingdom',
  '1 Recovery Park',
  'Norwich',
  'Norfolk',
  'NR3 1RX',
  false,
  'active',
  'enterprise',
  now() + interval '90 days',
  'billing+apex@wastex.test',
  'ACTIVE',
  now() - interval '60 days',
  now() - interval '65 days'
),
(
  'demo-org-civilsone',
  'CivilsOne National Projects Ltd',
  NULL,
  ARRAY['generator','manager','carrier'],
  'enterprise',
  'National civil engineering',
  '01632 960005',
  'compliance+civilsone@wastex.test',
  'United Kingdom',
  '200 Infrastructure House',
  'Birmingham',
  'West Midlands',
  'B1 1CI',
  false,
  'active',
  'enterprise',
  now() + interval '120 days',
  'billing+civilsone@wastex.test',
  'ACTIVE',
  now() - interval '70 days',
  now() - interval '80 days'
);

/* =========================================================
   SITES
========================================================= */

INSERT INTO bb_sites (
  id,
  "organisationId",
  name,
  "siteType",
  "fullAddress",
  postcode,
  "permitNumber",
  "isDefault",
  status,
  "createdAt",
  "updatedAt"
)
VALUES
('demo-site-solo-main', 'demo-org-solo', 'Main Site', 'main_site', '12 Market Street, Cambridge, Cambridgeshire, United Kingdom', 'CB1 1AA', NULL, true, 'active', now(), now()),

('demo-site-greenbuild-main', 'demo-org-greenbuild', 'Main Site', 'main_site', '88 Riverside Business Park, Cambridge, Cambridgeshire, United Kingdom', 'CB4 2AA', NULL, true, 'active', now(), now()),
('demo-site-greenbuild-cambridge', 'demo-org-greenbuild', 'Cambridge Project', 'construction_site', 'Cambridge North Development, Cambridge, United Kingdom', 'CB4 0WS', NULL, false, 'active', now(), now()),

('demo-site-orange-main', 'demo-org-orange-skip', 'Main Site', 'main_site', '4 Haulage Road, Ipswich, Suffolk, United Kingdom', 'IP1 4SK', 'CBDU-DEMO-ORANGE', true, 'active', now(), now()),
('demo-site-orange-ipswich', 'demo-org-orange-skip', 'Ipswich Depot', 'depot', 'Unit 9, Portman Industrial Estate, Ipswich, United Kingdom', 'IP2 0UB', 'CBDU-DEMO-ORANGE', false, 'active', now(), now()),

('demo-site-apex-main', 'demo-org-apex-recovery', 'Main Site', 'main_site', '1 Recovery Park, Norwich, Norfolk, United Kingdom', 'NR3 1RX', 'EPR-DEMO-APEX-MAIN', true, 'active', now(), now()),
('demo-site-apex-ipswich', 'demo-org-apex-recovery', 'Ipswich Transfer Station', 'transfer_station', 'Dockside Waste Transfer Station, Ipswich, United Kingdom', 'IP3 0AB', 'EPR-DEMO-APEX-IP', false, 'active', now(), now()),
('demo-site-apex-norwich-yard', 'demo-org-apex-recovery', 'Norwich Recycling Yard', 'recycling_yard', 'North Yard, Norwich, United Kingdom', 'NR6 6YY', 'EPR-DEMO-APEX-NR', false, 'active', now(), now()),

('demo-site-civils-main', 'demo-org-civilsone', 'Main Site', 'main_site', '200 Infrastructure House, Birmingham, West Midlands, United Kingdom', 'B1 1CI', NULL, true, 'active', now(), now()),
('demo-site-civils-birmingham', 'demo-org-civilsone', 'Birmingham Project', 'construction_site', 'Eastside Works Compound, Birmingham, United Kingdom', 'B7 4BL', NULL, false, 'active', now(), now());

/* =========================================================
   DEPARTMENTS
========================================================= */

INSERT INTO bb_departments (id, "organisationId", name, type, "createdAt")
VALUES
('demo-dept-solo-generator', 'demo-org-solo', 'Solo Generator', 'generator', now()),
('demo-dept-solo-compliance', 'demo-org-solo', 'Compliance', 'compliance', now()),

('demo-dept-greenbuild-generator', 'demo-org-greenbuild', 'Site Waste Team', 'generator', now()),
('demo-dept-greenbuild-manager', 'demo-org-greenbuild', 'Waste Management', 'manager', now()),
('demo-dept-greenbuild-compliance', 'demo-org-greenbuild', 'Compliance', 'compliance', now()),

('demo-dept-orange-carrier', 'demo-org-orange-skip', 'Carrier Operations', 'carrier', now()),
('demo-dept-orange-compliance', 'demo-org-orange-skip', 'Compliance', 'compliance', now()),

('demo-dept-apex-manager', 'demo-org-apex-recovery', 'Receiving Operations', 'manager', now()),
('demo-dept-apex-carrier', 'demo-org-apex-recovery', 'Fleet Operations', 'carrier', now()),
('demo-dept-apex-compliance', 'demo-org-apex-recovery', 'Compliance', 'compliance', now()),

('demo-dept-civils-generator', 'demo-org-civilsone', 'Project Waste Teams', 'generator', now()),
('demo-dept-civils-manager', 'demo-org-civilsone', 'National Waste Management', 'manager', now()),
('demo-dept-civils-carrier', 'demo-org-civilsone', 'Internal Logistics', 'carrier', now()),
('demo-dept-civils-compliance', 'demo-org-civilsone', 'Enterprise Compliance', 'compliance', now());

/* =========================================================
   USERS
   Password for all demo users: WasteXDemo123!
========================================================= */

INSERT INTO bb_user (
  id,
  name,
  email,
  "passwordHash",
  "organisationId",
  "departmentId",
  role,
  "isActive",
  "isSuspended",
  status,
  "createdAt"
)
VALUES
(
  'demo-user-solo',
  'Sam Solo',
  'demo.solo@wastex.test',
  crypt('WasteXDemo123!', gen_salt('bf', 10)),
  'demo-org-solo',
  'demo-dept-solo-generator',
  'administrator',
  true,
  false,
  'ACTIVE',
  now() - interval '21 days'
),
(
  'demo-user-generator',
  'Grace GreenBuild',
  'demo.generator@wastex.test',
  crypt('WasteXDemo123!', gen_salt('bf', 10)),
  'demo-org-greenbuild',
  'demo-dept-greenbuild-generator',
  'administrator',
  true,
  false,
  'ACTIVE',
  now() - interval '40 days'
),
(
  'demo-user-carrier',
  'Ollie Orange',
  'demo.carrier@wastex.test',
  crypt('WasteXDemo123!', gen_salt('bf', 10)),
  'demo-org-orange-skip',
  'demo-dept-orange-carrier',
  'administrator',
  true,
  false,
  'ACTIVE',
  now() - interval '35 days'
),
(
  'demo-user-manager',
  'Amara Apex',
  'demo.manager@wastex.test',
  crypt('WasteXDemo123!', gen_salt('bf', 10)),
  'demo-org-apex-recovery',
  'demo-dept-apex-manager',
  'administrator',
  true,
  false,
  'ACTIVE',
  now() - interval '60 days'
),
(
  'demo-user-enterprise',
  'Elliot Enterprise',
  'demo.enterprise@wastex.test',
  crypt('WasteXDemo123!', gen_salt('bf', 10)),
  'demo-org-civilsone',
  'demo-dept-civils-compliance',
  'administrator',
  true,
  false,
  'ACTIVE',
  now() - interval '70 days'
);

/* =========================================================
   USER PROFILES
========================================================= */

INSERT INTO bb_user_profile (
  id,
  "userId",
  "fullName",
  telephone,
  "emailAddress",
  country,
  "streetAddress",
  city,
  region,
  "postCode",
  "createdAt",
  "updatedAt"
)
VALUES
('demo-profile-solo', 'demo-user-solo', 'Sam Solo', '01632 970001', 'demo.solo@wastex.test', 'United Kingdom', '12 Market Street', 'Cambridge', 'Cambridgeshire', 'CB1 1AA', now(), now()),
('demo-profile-generator', 'demo-user-generator', 'Grace GreenBuild', '01632 970002', 'demo.generator@wastex.test', 'United Kingdom', '88 Riverside Business Park', 'Cambridge', 'Cambridgeshire', 'CB4 2AA', now(), now()),
('demo-profile-carrier', 'demo-user-carrier', 'Ollie Orange', '01632 970003', 'demo.carrier@wastex.test', 'United Kingdom', '4 Haulage Road', 'Ipswich', 'Suffolk', 'IP1 4SK', now(), now()),
('demo-profile-manager', 'demo-user-manager', 'Amara Apex', '01632 970004', 'demo.manager@wastex.test', 'United Kingdom', '1 Recovery Park', 'Norwich', 'Norfolk', 'NR3 1RX', now(), now()),
('demo-profile-enterprise', 'demo-user-enterprise', 'Elliot Enterprise', '01632 970005', 'demo.enterprise@wastex.test', 'United Kingdom', '200 Infrastructure House', 'Birmingham', 'West Midlands', 'B1 1CI', now(), now());

/* =========================================================
   WASTE LISTINGS
========================================================= */

INSERT INTO bb_waste_listing (
  id,
  "userId",
  "siteId",
  "organisationId",
  "participationMode",
  market_mode,
  listing_type,
  visibility,
  "assignmentMethod",
  "assignedCarrierOrganisationId",
  "assignedByOrganisationId",
  "assignedAt",
  "winner_bid_id",
  "templateId",
  "templateVersion",
  name,
  location,
  "startingPrice",
  "currentBid",
  "fileKey",
  "endDate",
  archived,
  status,
  "createdAt"
)
VALUES
(
  900001,
  'demo-user-generator',
  'demo-site-greenbuild-cambridge',
  'demo-org-greenbuild',
  'external',
  'direct_award',
  'waste_collection',
  'private',
  'direct',
  NULL,
  'demo-org-greenbuild',
  now() - interval '8 days',
  NULL,
  'demo-template-cd-waste',
  1,
  'Mixed construction waste from Cambridge Project',
  'Cambridge Project, CB4',
  0,
  0,
  'demo-file-listing-900001',
  now() + interval '14 days',
  false,
  'assigned',
  now() - interval '9 days'
),
(
  900002,
  'demo-user-generator',
  'demo-site-greenbuild-main',
  'demo-org-greenbuild',
  'external',
  'direct_award',
  'waste_collection',
  'private',
  'direct',
  NULL,
  'demo-org-greenbuild',
  now() - interval '7 days',
  NULL,
  'demo-template-packaging',
  1,
  'Timber and packaging waste',
  'GreenBuild Main Site',
  0,
  0,
  'demo-file-listing-900002',
  now() + interval '21 days',
  false,
  'assigned',
  now() - interval '8 days'
),
(
  900003,
  'demo-user-generator',
  'demo-site-greenbuild-cambridge',
  'demo-org-greenbuild',
  'external',
  'direct_award',
  'waste_collection',
  'private',
  'direct',
  'demo-org-orange-skip',
  'demo-org-greenbuild',
  now() - interval '6 days',
  NULL,
  'demo-template-rubble',
  1,
  'Concrete rubble and hardcore',
  'Cambridge Project, CB4',
  0,
  0,
  'demo-file-listing-900003',
  now() + interval '10 days',
  false,
  'assigned',
  now() - interval '7 days'
),
(
  900004,
  'demo-user-generator',
  'demo-site-greenbuild-main',
  'demo-org-greenbuild',
  'external',
  'direct_award',
  'waste_collection',
  'private',
  'direct',
  'demo-org-orange-skip',
  'demo-org-greenbuild',
  now() - interval '5 days',
  NULL,
  'demo-template-plasterboard',
  1,
  'Segregated plasterboard load',
  'GreenBuild Main Site',
  0,
  0,
  'demo-file-listing-900004',
  now() + interval '7 days',
  false,
  'assigned',
  now() - interval '6 days'
),
(
  900005,
  'demo-user-enterprise',
  'demo-site-civils-birmingham',
  'demo-org-civilsone',
  'external',
  'direct_award',
  'waste_collection',
  'restricted',
  'direct',
  'demo-org-orange-skip',
  'demo-org-civilsone',
  now() - interval '10 days',
  NULL,
  'demo-template-contaminated-soil',
  1,
  'Contaminated soil from Birmingham Project',
  'Birmingham Project, B7',
  0,
  0,
  'demo-file-listing-900005',
  now() + interval '5 days',
  false,
  'in_progress',
  now() - interval '11 days'
),
(
  900006,
  'demo-user-enterprise',
  'demo-site-civils-main',
  'demo-org-civilsone',
  'external',
  'direct_award',
  'waste_collection',
  'restricted',
  'direct',
  'demo-org-orange-skip',
  'demo-org-civilsone',
  now() - interval '20 days',
  NULL,
  'demo-template-scrap-metal',
  1,
  'Scrap metal and cable drums',
  'CivilsOne Main Site',
  0,
  0,
  'demo-file-listing-900006',
  now() - interval '2 days',
  false,
  'completed',
  now() - interval '22 days'
),
(
  900007,
  'demo-user-manager',
  'demo-site-apex-norwich-yard',
  'demo-org-apex-recovery',
  'internal',
  'internal_only',
  'internal_transfer',
  'private',
  'direct',
  'demo-org-apex-recovery',
  'demo-org-apex-recovery',
  now() - interval '13 days',
  NULL,
  'demo-template-internal-transfer',
  1,
  'Internal transfer: baled plastics to Norwich Yard',
  'Norwich Recycling Yard',
  0,
  0,
  'demo-file-listing-900007',
  now() - interval '1 day',
  false,
  'completed',
  now() - interval '14 days'
),
(
  900008,
  'demo-user-carrier',
  'demo-site-orange-ipswich',
  'demo-org-orange-skip',
  'internal',
  'direct_award',
  'waste_collection',
  'private',
  'direct',
  'demo-org-orange-skip',
  'demo-org-orange-skip',
  now() - interval '2 days',
  NULL,
  'external-manual-job',
  1,
  'Suffolk Retail Park - private skip exchange',
  'Suffolk Retail Park, Ipswich',
  0,
  0,
  'demo-file-listing-900008',
  now() + interval '30 days',
  false,
  'assigned',
  now() - interval '2 days'
),
(
  900009,
  'demo-user-carrier',
  'demo-site-orange-main',
  'demo-org-orange-skip',
  'internal',
  'direct_award',
  'waste_collection',
  'private',
  'direct',
  'demo-org-orange-skip',
  'demo-org-orange-skip',
  now() - interval '12 days',
  NULL,
  'external-manual-job',
  1,
  'Private household renovation skip',
  'Ipswich residential address',
  0,
  0,
  'demo-file-listing-900009',
  now() - interval '1 day',
  false,
  'completed',
  now() - interval '12 days'
);

/* =========================================================
   ASSIGNMENTS
========================================================= */

INSERT INTO bb_carrier_assignment (
  id,
  "organisationId",
  "listingId",
  "siteId",
  "jobSource",
  "externalCustomerName",
  "externalCustomerEmail",
  "externalCustomerPhone",
  "externalReference",
  "externalPickupAddress",
  "externalPickupPostcode",
  "externalDestinationName",
  "externalDestinationAddress",
  "externalDestinationPostcode",
  "externalWasteDescription",
  "externalEwcCode",
  "externalEstimatedWeight",
  "externalCollectionDate",
  "externalNotes",
  "carrierOrganisationId",
  "assignedByOrganisationId",
  "managerOrganisationId",
  "assignmentMethod",
  "bidId",
  status,
  "verificationCode",
  "codeGeneratedAt",
  "codeUsedAt",
  "managerAcceptedAt",
  "carrierAssignedAt",
  "assignedAt",
  "respondedAt",
  "collectedAt",
  "completedAt"
)
VALUES
(
  'demo-assignment-pending-manager',
  'demo-org-greenbuild',
  900001,
  'demo-site-greenbuild-cambridge',
  'wastex_marketplace',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  NULL,
  'demo-org-greenbuild',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'pending',
  NULL,NULL,NULL,NULL,NULL,
  now() - interval '8 days',
  NULL,NULL,NULL
),
(
  'demo-assignment-waiting-carrier',
  'demo-org-greenbuild',
  900002,
  'demo-site-greenbuild-main',
  'wastex_marketplace',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  NULL,
  'demo-org-greenbuild',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'pending',
  NULL,NULL,NULL,
  now() - interval '6 days',
  NULL,
  now() - interval '7 days',
  now() - interval '6 days',
  NULL,NULL
),
(
  'demo-assignment-carrier-response',
  'demo-org-greenbuild',
  900003,
  'demo-site-greenbuild-cambridge',
  'wastex_marketplace',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  'demo-org-orange-skip',
  'demo-org-greenbuild',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'pending',
  NULL,NULL,NULL,
  now() - interval '5 days',
  now() - interval '4 days',
  now() - interval '6 days',
  NULL,
  NULL,NULL
),
(
  'demo-assignment-active-accepted',
  'demo-org-greenbuild',
  900004,
  'demo-site-greenbuild-main',
  'wastex_marketplace',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  'demo-org-orange-skip',
  'demo-org-greenbuild',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'accepted',
  'WX-889104',
  now() - interval '4 days',
  NULL,
  now() - interval '4 days',
  now() - interval '4 days',
  now() - interval '5 days',
  now() - interval '4 days',
  NULL,NULL
),
(
  'demo-assignment-in-progress-incident',
  'demo-org-civilsone',
  900005,
  'demo-site-civils-birmingham',
  'wastex_marketplace',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  'demo-org-orange-skip',
  'demo-org-civilsone',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'in_progress',
  'WX-120441',
  now() - interval '8 days',
  now() - interval '6 days',
  now() - interval '9 days',
  now() - interval '8 days',
  now() - interval '10 days',
  now() - interval '8 days',
  now() - interval '6 days',
  NULL
),
(
  'demo-assignment-completed-001',
  'demo-org-civilsone',
  900006,
  'demo-site-civils-main',
  'wastex_marketplace',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  'demo-org-orange-skip',
  'demo-org-civilsone',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'completed',
  'WX-993002',
  now() - interval '18 days',
  now() - interval '15 days',
  now() - interval '19 days',
  now() - interval '18 days',
  now() - interval '20 days',
  now() - interval '18 days',
  now() - interval '15 days',
  now() - interval '14 days'
),
(
  'demo-assignment-internal-completed',
  'demo-org-apex-recovery',
  900007,
  'demo-site-apex-norwich-yard',
  'internal_operation',
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  'demo-org-apex-recovery',
  'demo-org-apex-recovery',
  'demo-org-apex-recovery',
  'direct',
  NULL,
  'completed',
  'WX-INT-017',
  now() - interval '12 days',
  now() - interval '10 days',
  now() - interval '12 days',
  now() - interval '12 days',
  now() - interval '13 days',
  now() - interval '12 days',
  now() - interval '10 days',
  now() - interval '9 days'
),
(
  'demo-assignment-external-001',
  'demo-org-orange-skip',
  900008,
  'demo-site-orange-ipswich',
  'external_manual',
  'Suffolk Retail Park',
  'facilities@suffolk-retail.example',
  '01473 555010',
  'SRP-SKIP-1044',
  'Unit 12, Suffolk Retail Park, Ipswich',
  'IP2 0UA',
  'Orange Skip Ipswich Depot',
  'Unit 9, Portman Industrial Estate, Ipswich',
  'IP2 0UB',
  'Mixed commercial packaging and light construction waste',
  '170904',
  4.250,
  now() + interval '2 days',
  'Customer requested morning collection before 10:30.',
  'demo-org-orange-skip',
  'demo-org-orange-skip',
  NULL,
  'direct',
  NULL,
  'accepted',
  'WX-EXT-441',
  now() - interval '1 day',
  NULL,
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '2 days',
  NULL,
  NULL
),
(
  'demo-assignment-external-002',
  'demo-org-orange-skip',
  900009,
  'demo-site-orange-main',
  'external_manual',
  'Private Household Customer',
  'customer@example.test',
  '01473 555099',
  'HOME-SKIP-221',
  'Residential renovation, Ipswich',
  'IP1 6ZZ',
  'Orange Skip Main Site',
  '4 Haulage Road, Ipswich',
  'IP1 4SK',
  'Mixed household renovation waste',
  '170904',
  2.100,
  now() - interval '3 days',
  'Completed private skip collection.',
  'demo-org-orange-skip',
  'demo-org-orange-skip',
  NULL,
  'direct',
  NULL,
  'completed',
  'WX-EXT-222',
  now() - interval '11 days',
  now() - interval '8 days',
  now() - interval '12 days',
  now() - interval '12 days',
  now() - interval '12 days',
  now() - interval '12 days',
  now() - interval '8 days',
  now() - interval '7 days'
);

/* =========================================================
   INCIDENTS
========================================================= */

INSERT INTO bb_incident (
  id,
  "siteId",
  "organisationId",
  "assignmentId",
  "listingId",
  "reportedByUserId",
  "reportedByOrganisationId",
  "incidentDate",
  "incidentLocation",
  type,
  summary,
  "immediateAction",
  "investigationFindings",
  "correctiveActions",
  "preventativeMeasures",
  "complianceReview",
  "responsiblePerson",
  "dateClosed",
  status,
  "resolvedByUserId",
  "createdAt",
  "resolvedAt"
)
VALUES
(
  'demo-incident-open-contamination',
  'demo-site-civils-birmingham',
  'demo-org-civilsone',
  'demo-assignment-in-progress-incident',
  900005,
  'demo-user-enterprise',
  'demo-org-civilsone',
  now() - interval '5 days',
  'Birmingham Project loading bay',
  'Contamination',
  'Unexpected oily residue found during loading of soil waste.',
  'Collection paused and load quarantined pending review.',
  NULL,
  NULL,
  NULL,
  'Compliance review required before completion.',
  'Elliot Enterprise',
  NULL,
  'open',
  NULL,
  now() - interval '5 days',
  NULL
),
(
  'demo-incident-resolved-damage',
  'demo-site-apex-norwich-yard',
  'demo-org-apex-recovery',
  'demo-assignment-internal-completed',
  900007,
  'demo-user-manager',
  'demo-org-apex-recovery',
  now() - interval '9 days',
  'Norwich Recycling Yard',
  'Container damage',
  'One container was found damaged after internal transfer.',
  'Container removed from service.',
  'Damage was caused during unloading and did not affect waste containment.',
  'Forklift unloading process updated.',
  'Daily container check added.',
  'Reviewed and closed by site manager.',
  'Amara Apex',
  now() - interval '8 days',
  'resolved',
  'demo-user-manager',
  now() - interval '9 days',
  now() - interval '8 days'
);

/* =========================================================
   WASTE RECEIPTS
========================================================= */

INSERT INTO bb_waste_receipt (
  id,
  "organisationId",
  "assignmentId",
  "listingId",
  "siteId",
  "receivedByUserId",
  "carrierOrganisationId",
  "receiverOrganisationId",
  "receivedAt",
  status,
  "hazardousWasteConsignmentCode",
  "reasonForNoConsignmentCode",
  "yourUniqueReference",
  "otherReferencesForMovement",
  "specialHandlingRequirements",
  "carrierRegistrationNumber",
  "carrierOrganisationName",
  "carrierFullAddress",
  "carrierPostcode",
  "carrierEmailAddress",
  "carrierPhoneNumber",
  "carrierVehicleRegistration",
  "carrierMeansOfTransport",
  "receiverSiteName",
  "receiverEmailAddress",
  "receiverPhoneNumber",
  "receiverAuthorisationNumber",
  "receiverRegulatoryPositionStatements",
  "receiptFullAddress",
  "receiptPostcode",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'demo-receipt-completed-001',
  'demo-org-apex-recovery',
  'demo-assignment-completed-001',
  900006,
  'demo-site-apex-ipswich',
  'demo-user-manager',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  now() - interval '14 days',
  'submitted',
  NULL,
  'NON_HAZ_WASTE_TRANSFER',
  'CIVILS-SCRAP-001',
  '[{"label":"PO Number","reference":"PO-7781"}]',
  'Keep segregated from mixed metals pending weighing confirmation.',
  'CBDU-DEMO-ORANGE',
  'Orange Skip Logistics Ltd',
  '4 Haulage Road, Ipswich, Suffolk',
  'IP1 4SK',
  'dispatch+orange@wastex.test',
  '01632 960003',
  'WX10 ORG',
  'Road',
  'Ipswich Transfer Station',
  'compliance+apex@wastex.test',
  '01632 960004',
  'EPR-DEMO-APEX-IP',
  '[343,456]',
  'Dockside Waste Transfer Station, Ipswich',
  'IP3 0AB',
  now() - interval '14 days',
  now() - interval '14 days'
),
(
  'demo-receipt-warning-001',
  'demo-org-apex-recovery',
  'demo-assignment-active-accepted',
  900004,
  'demo-site-apex-main',
  'demo-user-manager',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  now() - interval '2 days',
  'submitted',
  NULL,
  'NON_HAZ_WASTE_TRANSFER',
  'GB-PLASTER-443',
  '[{"label":"Site Ref","reference":"GB-MAIN-PLASTER"}]',
  'Keep dry. Plasterboard only.',
  'CBDU-DEMO-ORANGE',
  'Orange Skip Logistics Ltd',
  '4 Haulage Road, Ipswich, Suffolk',
  'IP1 4SK',
  'dispatch+orange@wastex.test',
  '01632 960003',
  'WX55 ORG',
  'Road',
  'Main Site',
  'compliance+apex@wastex.test',
  '01632 960004',
  'EPR-DEMO-APEX-MAIN',
  '[343]',
  '1 Recovery Park, Norwich',
  'NR3 1RX',
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  'demo-receipt-rejected-001',
  'demo-org-apex-recovery',
  'demo-assignment-in-progress-incident',
  900005,
  'demo-site-apex-ipswich',
  'demo-user-manager',
  'demo-org-orange-skip',
  'demo-org-apex-recovery',
  now() - interval '4 days',
  'draft',
  'CIVILS/A0001',
  NULL,
  'CIVILS-SOIL-009',
  '[{"label":"Project","reference":"Birmingham Eastside"}]',
  'Quarantined pending contamination review.',
  'CBDU-DEMO-ORANGE',
  'Orange Skip Logistics Ltd',
  '4 Haulage Road, Ipswich, Suffolk',
  'IP1 4SK',
  'dispatch+orange@wastex.test',
  '01632 960003',
  'WX20 ORG',
  'Road',
  'Ipswich Transfer Station',
  'compliance+apex@wastex.test',
  '01632 960004',
  'EPR-DEMO-APEX-IP',
  '[456]',
  'Dockside Waste Transfer Station, Ipswich',
  'IP3 0AB',
  now() - interval '4 days',
  now() - interval '4 days'
);

/* =========================================================
   WASTE RECEIPT ITEMS
========================================================= */

INSERT INTO bb_waste_receipt_item (
  id,
  "organisationId",
  "receiptId",
  "ewcCodes",
  "wasteDescription",
  "physicalForm",
  "numberOfContainers",
  "typeOfContainers",
  "weightMetric",
  "weightAmount",
  "weightIsEstimate",
  "containsPops",
  "popsSourceOfComponents",
  "popsComponents",
  "containsHazardous",
  "hazardousSourceOfComponents",
  "hazardousHazCodes",
  "hazardousComponents",
  "disposalOrRecoveryCodes",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'demo-receipt-item-scrap-metal',
  'demo-org-apex-recovery',
  'demo-receipt-completed-001',
  '["170405","170407"]',
  'Mixed scrap metal and cable drums',
  'Solid',
  4,
  'Roll-on roll-off containers',
  'Tonnes',
  6.450,
  false,
  false,
  NULL,
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  '[{"code":"R4","weight":{"metric":"Tonnes","amount":6.45,"isEstimate":false}}]',
  now() - interval '14 days',
  now() - interval '14 days'
),
(
  'demo-receipt-item-plasterboard',
  'demo-org-apex-recovery',
  'demo-receipt-warning-001',
  '["170802"]',
  'Segregated plasterboard',
  'Solid',
  2,
  'Skips',
  'Tonnes',
  3.250,
  true,
  false,
  NULL,
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  '[{"code":"R5","weight":{"metric":"Tonnes","amount":3.25,"isEstimate":true}}]',
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  'demo-receipt-item-contaminated-soil',
  'demo-org-apex-recovery',
  'demo-receipt-rejected-001',
  '["170503"]',
  'Soil containing hazardous substances',
  'Solid',
  3,
  'Sealed containers',
  'Tonnes',
  8.800,
  true,
  false,
  NULL,
  NULL,
  true,
  'PROVIDED_WITH_WASTE',
  '["HP_5","HP_14"]',
  '[{"name":"hydrocarbon residue","concentration":42.5}]',
  '[{"code":"D9","weight":{"metric":"Tonnes","amount":8.8,"isEstimate":true}}]',
  now() - interval '4 days',
  now() - interval '4 days'
);

/* =========================================================
   DIGITAL WASTE TRACKING SUBMISSIONS
========================================================= */

INSERT INTO bb_waste_tracking_submission (
  id,
  "organisationId",
  "assignmentId",
  "listingId",
  "siteId",
  "receiptId",
  "submittedByUserId",
  "wasteTrackingId",
  "submissionType",
  status,
  method,
  endpoint,
  "payloadSnapshot",
  "responseSnapshot",
  "validationWarnings",
  "validationErrors",
  "submittedAt",
  "lastAttemptedAt",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'demo-dwt-completed-failed-attempt',
  'demo-org-apex-recovery',
  'demo-assignment-completed-001',
  900006,
  'demo-site-apex-ipswich',
  'demo-receipt-completed-001',
  'demo-user-manager',
  NULL,
  'receive',
  'failed',
  'POST',
  '/waste-tracking/receive',
  '{"demo":true,"attempt":"failed-before-success","reporting":"receive"}',
  '{"ok":false,"statusCode":500,"method":"POST","endpoint":"/waste-tracking/receive","error":"Demo previous API failure before retry."}',
  '[]',
  '[{"key":"service","message":"Demo previous attempt failed before accepted retry."}]',
  now() - interval '15 days',
  now() - interval '15 days',
  now() - interval '15 days',
  now() - interval '15 days'
),
(
  'demo-dwt-completed-success-latest',
  'demo-org-apex-recovery',
  'demo-assignment-completed-001',
  900006,
  'demo-site-apex-ipswich',
  'demo-receipt-completed-001',
  'demo-user-manager',
  'WT-DEMO-ACCEPTED-001',
  'receive',
  'accepted',
  'POST',
  '/waste-tracking/receive',
  '{"demo":true,"attempt":"latest-success","reporting":"receive"}',
  '{"ok":true,"statusCode":202,"method":"POST","endpoint":"/waste-tracking/receive","responseBody":{"wasteTrackingId":"WT-DEMO-ACCEPTED-001"}}',
  '[]',
  '[]',
  now() - interval '14 days',
  now() - interval '14 days',
  now() - interval '14 days',
  now() - interval '14 days'
),
(
  'demo-dwt-warning-latest',
  'demo-org-apex-recovery',
  'demo-assignment-active-accepted',
  900004,
  'demo-site-apex-main',
  'demo-receipt-warning-001',
  'demo-user-manager',
  'WT-DEMO-WARNING-001',
  'receive',
  'accepted_with_warnings',
  'POST',
  '/waste-tracking/receive',
  '{"demo":true,"attempt":"warning","reporting":"receive"}',
  '{"ok":true,"statusCode":202,"method":"POST","endpoint":"/waste-tracking/receive","responseBody":{"wasteTrackingId":"WT-DEMO-WARNING-001"}}',
  '[{"key":"wasteItems[0].weight","message":"Weight accepted but marked as estimated."}]',
  '[]',
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  'demo-dwt-rejected-latest',
  'demo-org-apex-recovery',
  'demo-assignment-in-progress-incident',
  900005,
  'demo-site-apex-ipswich',
  'demo-receipt-rejected-001',
  'demo-user-manager',
  NULL,
  'receive',
  'rejected',
  'POST',
  '/waste-tracking/receive',
  '{"demo":true,"attempt":"rejected","reporting":"receive"}',
  '{"ok":false,"statusCode":400,"method":"POST","endpoint":"/waste-tracking/receive","error":"Hazardous component data requires review."}',
  '[]',
  '[{"key":"hazardousWasteConsignmentCode","message":"Hazardous waste consignment details need review before submission."}]',
  now() - interval '4 days',
  now() - interval '4 days',
  now() - interval '4 days',
  now() - interval '4 days'
);

/* =========================================================
   REPORT EXPORT HISTORY
========================================================= */

INSERT INTO bb_report_export (
  id,
  "siteId",
  "organisationId",
  "requestedByUserId",
  "departmentId",
  "reportType",
  format,
  status,
  title,
  "filtersJson",
  "fileName",
  "mimeType",
  "rowCount",
  "generatedAt",
  "downloadedAt",
  "expiresAt",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'demo-report-apex-all-sites-assignment-summary',
  NULL,
  'demo-org-apex-recovery',
  'demo-user-manager',
  'demo-dept-apex-manager',
  'assignment_summary',
  'csv',
  'completed',
  'Assignment Summary - All Sites',
  '{"status":"all"}',
  'assignment-summary-all-sites-demo.csv',
  'text/csv; charset=utf-8',
  8,
  now() - interval '3 days',
  now() - interval '3 days',
  now() + interval '30 days',
  now() - interval '3 days',
  now() - interval '3 days'
),
(
  'demo-report-apex-ipswich-dwt',
  'demo-site-apex-ipswich',
  'demo-org-apex-recovery',
  'demo-user-manager',
  'demo-dept-apex-manager',
  'dwt_submissions',
  'json',
  'completed',
  'DWT Submissions - Ipswich Transfer Station',
  '{"status":"all","siteId":"demo-site-apex-ipswich"}',
  'dwt-submissions-ipswich-demo.json',
  'application/json; charset=utf-8',
  3,
  now() - interval '2 days',
  NULL,
  now() + interval '30 days',
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  'demo-report-apex-incident-log',
  'demo-site-apex-norwich-yard',
  'demo-org-apex-recovery',
  'demo-user-manager',
  'demo-dept-apex-compliance',
  'incident_log',
  'csv',
  'completed',
  'Incident Log - Norwich Recycling Yard',
  '{"status":"resolved","siteId":"demo-site-apex-norwich-yard"}',
  'incident-log-norwich-yard-demo.csv',
  'text/csv; charset=utf-8',
  1,
  now() - interval '8 days',
  now() - interval '7 days',
  now() + interval '30 days',
  now() - interval '8 days',
  now() - interval '8 days'
),
(
  'demo-report-orange-external-jobs',
  'demo-site-orange-ipswich',
  'demo-org-orange-skip',
  'demo-user-carrier',
  'demo-dept-orange-carrier',
  'carrier_performance',
  'csv',
  'completed',
  'Carrier Performance - Ipswich Depot',
  '{"status":"all","siteId":"demo-site-orange-ipswich"}',
  'carrier-performance-ipswich-demo.csv',
  'text/csv; charset=utf-8',
  2,
  now() - interval '1 day',
  NULL,
  now() + interval '30 days',
  now() - interval '1 day',
  now() - interval '1 day'
),
(
  'demo-report-civils-compliance-pack',
  NULL,
  'demo-org-civilsone',
  'demo-user-enterprise',
  'demo-dept-civils-compliance',
  'compliance_audit_pack',
  'json',
  'completed',
  'Compliance Audit Pack - Enterprise Overview',
  '{"status":"all"}',
  'compliance-audit-pack-enterprise-demo.json',
  'application/json; charset=utf-8',
  12,
  now() - interval '5 days',
  now() - interval '5 days',
  now() + interval '30 days',
  now() - interval '5 days',
  now() - interval '5 days'
);

/* =========================================================
   WASTE EVENTS
========================================================= */

INSERT INTO bb_waste_event (
  id,
  "organisationId",
  "listingId",
  "carrierAssignmentId",
  "performedByUserId",
  "eventType",
  "actorOrganisationId",
  "actorRole",
  "targetOrganisationId",
  "siteId",
  "wasteType",
  "wasteQuantity",
  metadata,
  "createdAt"
)
VALUES
(
  'demo-event-001-created',
  'demo-org-greenbuild',
  900004,
  'demo-assignment-active-accepted',
  'demo-user-generator',
  'WASTE_CREATED',
  'demo-org-greenbuild',
  'generator',
  'demo-org-apex-recovery',
  'demo-site-greenbuild-main',
  'Plasterboard',
  3,
  '{"demo":true,"stage":"listing_created"}',
  now() - interval '6 days'
),
(
  'demo-event-002-assigned',
  'demo-org-greenbuild',
  900004,
  'demo-assignment-active-accepted',
  'demo-user-generator',
  'TRANSFER_ASSIGNED',
  'demo-org-greenbuild',
  'generator',
  'demo-org-apex-recovery',
  'demo-site-greenbuild-main',
  'Plasterboard',
  3,
  '{"demo":true,"stage":"manager_assigned"}',
  now() - interval '5 days'
),
(
  'demo-event-003-collected',
  'demo-org-civilsone',
  900006,
  'demo-assignment-completed-001',
  'demo-user-carrier',
  'WASTE_COLLECTED',
  'demo-org-orange-skip',
  'carrier',
  'demo-org-apex-recovery',
  'demo-site-civils-main',
  'Scrap metal',
  6,
  '{"demo":true,"stage":"carrier_collected"}',
  now() - interval '15 days'
),
(
  'demo-event-004-received',
  'demo-org-apex-recovery',
  900006,
  'demo-assignment-completed-001',
  'demo-user-manager',
  'WASTE_RECEIVED',
  'demo-org-apex-recovery',
  'manager',
  'demo-org-civilsone',
  'demo-site-apex-ipswich',
  'Scrap metal',
  6,
  '{"demo":true,"stage":"receiver_confirmed"}',
  now() - interval '14 days'
);

/* =========================================================
   NOTIFICATIONS
========================================================= */

INSERT INTO bb_notification (
  id,
  "organisationId",
  "recipientId",
  "actorId",
  "listingId",
  type,
  title,
  message,
  "isRead",
  "createdAt"
)
VALUES
(
  'demo-notification-manager-response',
  'demo-org-apex-recovery',
  'demo-user-manager',
  'demo-user-generator',
  900001,
  'assignment_pending',
  'Manager response required',
  'GreenBuild assigned a Cambridge Project waste movement that needs manager review.',
  false,
  now() - interval '1 day'
),
(
  'demo-notification-carrier-response',
  'demo-org-orange-skip',
  'demo-user-carrier',
  'demo-user-manager',
  900003,
  'carrier_response_required',
  'Carrier response required',
  'Apex Recovery assigned a concrete rubble collection to Orange Skip Logistics.',
  false,
  now() - interval '18 hours'
),
(
  'demo-notification-incident-open',
  'demo-org-civilsone',
  'demo-user-enterprise',
  'demo-user-manager',
  900005,
  'incident_open',
  'Open incident requires review',
  'Contaminated soil movement has an unresolved incident and should not be completed yet.',
  false,
  now() - interval '4 hours'
);

/* =========================================================
   KEEP SERIAL SEQUENCE SAFE AFTER EXPLICIT IDS
========================================================= */

SELECT setval(
  pg_get_serial_sequence('bb_waste_listing', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM bb_waste_listing), 1)
);

SELECT setval(
  pg_get_serial_sequence('bb_bids', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM bb_bids), 1)
);

COMMIT;