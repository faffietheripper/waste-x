CREATE TABLE IF NOT EXISTS "bb_account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "bb_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"userId" text,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"action" text NOT NULL,
	"previousState" text,
	"newState" text,
	"ipAddress" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	"listingId" integer NOT NULL,
	"userId" text NOT NULL,
	"organisationId" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"declinedOffer" boolean DEFAULT false NOT NULL,
	"cancelledJob" boolean DEFAULT false NOT NULL,
	"cancellationReason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_carrier_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"listingId" integer NOT NULL,
	"carrierOrganisationId" text NOT NULL,
	"assignedByOrganisationId" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verificationCode" text,
	"codeGeneratedAt" timestamp,
	"codeUsedAt" timestamp,
	"assignedAt" timestamp DEFAULT now(),
	"respondedAt" timestamp,
	"collectedAt" timestamp,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"assignmentId" text NOT NULL,
	"listingId" integer NOT NULL,
	"reportedByUserId" text NOT NULL,
	"reportedByOrganisationId" text NOT NULL,
	"incidentDate" timestamp,
	"incidentLocation" text,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"immediateAction" text,
	"investigationFindings" text,
	"correctiveActions" text,
	"preventativeMeasures" text,
	"complianceReview" text,
	"responsiblePerson" text,
	"dateClosed" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"resolvedByUserId" text,
	"createdAt" timestamp DEFAULT now(),
	"resolvedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'GBP',
	"status" text DEFAULT 'pending' NOT NULL,
	"stripeInvoiceId" text,
	"createdAt" timestamp DEFAULT now(),
	"paidAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_listing_template_data" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"listingId" integer NOT NULL,
	"templateId" text NOT NULL,
	"templateVersion" integer NOT NULL,
	"dataJson" text NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_listing_template_field" (
	"id" text PRIMARY KEY NOT NULL,
	"templateId" text NOT NULL,
	"sectionId" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"fieldType" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"optionsJson" text,
	"helpText" text,
	"orderIndex" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_listing_template_section" (
	"id" text PRIMARY KEY NOT NULL,
	"templateId" text NOT NULL,
	"title" text NOT NULL,
	"orderIndex" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_listing_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"isLocked" boolean DEFAULT false NOT NULL,
	"createdByUserId" text NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"recipientId" text NOT NULL,
	"actorId" text,
	"listingId" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_organisation_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"stripeSubscriptionId" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"currentPeriodStart" timestamp,
	"currentPeriodEnd" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_organisation" (
	"id" text PRIMARY KEY NOT NULL,
	"teamName" text NOT NULL,
	"profilePicture" text,
	"chainOfCustody" text NOT NULL,
	"industry" text,
	"telephone" text NOT NULL,
	"emailAddress" text NOT NULL,
	"country" text NOT NULL,
	"streetAddress" text NOT NULL,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"postCode" text NOT NULL,
	"isSuspended" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"billingCustomerId" text,
	"subscriptionStatus" text DEFAULT 'trial',
	"subscriptionPlan" text DEFAULT 'starter',
	"trialEndsAt" timestamp,
	"billingEmail" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_passwordResetToken" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"expires" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"invoiceId" text NOT NULL,
	"stripePaymentIntentId" text,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_review" (
	"id" text PRIMARY KEY NOT NULL,
	"reviewerId" text NOT NULL,
	"reviewedOrganisationId" text NOT NULL,
	"listingId" integer,
	"rating" integer NOT NULL,
	"comment" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_support_ticket_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"ticketId" text NOT NULL,
	"senderUserId" text NOT NULL,
	"message" text NOT NULL,
	"isInternalNote" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"organisationId" text NOT NULL,
	"createdByUserId" text NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignedToUserId" text,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"profilePicture" text,
	"fullName" text NOT NULL,
	"telephone" text,
	"emailAddress" text,
	"country" text,
	"streetAddress" text,
	"city" text,
	"region" text,
	"postCode" text,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"passwordHash" text,
	"organisationId" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"isSuspended" boolean DEFAULT false NOT NULL,
	"lastLoginAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"inviteToken" text,
	"inviteExpiry" timestamp,
	"status" text DEFAULT 'INVITED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "bb_verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bb_waste_listing" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"organisationId" text NOT NULL,
	"winningBidId" integer,
	"winningOrganisationId" text,
	"assignedCarrierOrganisationId" text,
	"assignedByOrganisationId" text,
	"platformFee" integer,
	"templateId" text NOT NULL,
	"templateVersion" integer NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"startingPrice" integer DEFAULT 0 NOT NULL,
	"currentBid" integer DEFAULT 0 NOT NULL,
	"fileKey" text NOT NULL,
	"endDate" timestamp NOT NULL,
	"assignedAt" timestamp,
	"archived" boolean DEFAULT false NOT NULL,
	"offerAccepted" boolean DEFAULT false NOT NULL,
	"assigned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_account" ADD CONSTRAINT "bb_account_userId_bb_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_audit_event" ADD CONSTRAINT "bb_audit_event_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_audit_event" ADD CONSTRAINT "bb_audit_event_userId_bb_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."bb_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_bids" ADD CONSTRAINT "bb_bids_listingId_bb_waste_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."bb_waste_listing"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_bids" ADD CONSTRAINT "bb_bids_userId_bb_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_bids" ADD CONSTRAINT "bb_bids_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_carrier_assignment" ADD CONSTRAINT "bb_carrier_assignment_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_carrier_assignment" ADD CONSTRAINT "bb_carrier_assignment_listingId_bb_waste_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."bb_waste_listing"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_carrier_assignment" ADD CONSTRAINT "bb_carrier_assignment_carrierOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("carrierOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_carrier_assignment" ADD CONSTRAINT "bb_carrier_assignment_assignedByOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("assignedByOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_incident" ADD CONSTRAINT "bb_incident_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_incident" ADD CONSTRAINT "bb_incident_assignmentId_bb_carrier_assignment_id_fk" FOREIGN KEY ("assignmentId") REFERENCES "public"."bb_carrier_assignment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_incident" ADD CONSTRAINT "bb_incident_listingId_bb_waste_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."bb_waste_listing"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_incident" ADD CONSTRAINT "bb_incident_reportedByUserId_bb_user_id_fk" FOREIGN KEY ("reportedByUserId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_incident" ADD CONSTRAINT "bb_incident_reportedByOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("reportedByOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_incident" ADD CONSTRAINT "bb_incident_resolvedByUserId_bb_user_id_fk" FOREIGN KEY ("resolvedByUserId") REFERENCES "public"."bb_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_invoice" ADD CONSTRAINT "bb_invoice_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template_data" ADD CONSTRAINT "bb_listing_template_data_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template_data" ADD CONSTRAINT "bb_listing_template_data_listingId_bb_waste_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."bb_waste_listing"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template_data" ADD CONSTRAINT "bb_listing_template_data_templateId_bb_listing_template_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."bb_listing_template"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template_field" ADD CONSTRAINT "bb_listing_template_field_templateId_bb_listing_template_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."bb_listing_template"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template_field" ADD CONSTRAINT "bb_listing_template_field_sectionId_bb_listing_template_section_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."bb_listing_template_section"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template_section" ADD CONSTRAINT "bb_listing_template_section_templateId_bb_listing_template_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."bb_listing_template"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template" ADD CONSTRAINT "bb_listing_template_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_listing_template" ADD CONSTRAINT "bb_listing_template_createdByUserId_bb_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_notification" ADD CONSTRAINT "bb_notification_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_notification" ADD CONSTRAINT "bb_notification_recipientId_bb_user_id_fk" FOREIGN KEY ("recipientId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_notification" ADD CONSTRAINT "bb_notification_actorId_bb_user_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."bb_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_notification" ADD CONSTRAINT "bb_notification_listingId_bb_waste_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."bb_waste_listing"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_organisation_subscription" ADD CONSTRAINT "bb_organisation_subscription_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_payment" ADD CONSTRAINT "bb_payment_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_payment" ADD CONSTRAINT "bb_payment_invoiceId_bb_invoice_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."bb_invoice"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_review" ADD CONSTRAINT "bb_review_reviewerId_bb_user_id_fk" FOREIGN KEY ("reviewerId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_review" ADD CONSTRAINT "bb_review_reviewedOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("reviewedOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_review" ADD CONSTRAINT "bb_review_listingId_bb_waste_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."bb_waste_listing"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_session" ADD CONSTRAINT "bb_session_userId_bb_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_support_ticket_message" ADD CONSTRAINT "bb_support_ticket_message_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_support_ticket_message" ADD CONSTRAINT "bb_support_ticket_message_ticketId_bb_support_ticket_id_fk" FOREIGN KEY ("ticketId") REFERENCES "public"."bb_support_ticket"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_support_ticket_message" ADD CONSTRAINT "bb_support_ticket_message_senderUserId_bb_user_id_fk" FOREIGN KEY ("senderUserId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_support_ticket" ADD CONSTRAINT "bb_support_ticket_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_support_ticket" ADD CONSTRAINT "bb_support_ticket_createdByUserId_bb_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_support_ticket" ADD CONSTRAINT "bb_support_ticket_assignedToUserId_bb_user_id_fk" FOREIGN KEY ("assignedToUserId") REFERENCES "public"."bb_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_user_profile" ADD CONSTRAINT "bb_user_profile_userId_bb_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_user" ADD CONSTRAINT "bb_user_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_waste_listing" ADD CONSTRAINT "bb_waste_listing_userId_bb_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."bb_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_waste_listing" ADD CONSTRAINT "bb_waste_listing_organisationId_bb_organisation_id_fk" FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_waste_listing" ADD CONSTRAINT "bb_waste_listing_winningOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("winningOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_waste_listing" ADD CONSTRAINT "bb_waste_listing_assignedCarrierOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("assignedCarrierOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_waste_listing" ADD CONSTRAINT "bb_waste_listing_assignedByOrganisationId_bb_organisation_id_fk" FOREIGN KEY ("assignedByOrganisationId") REFERENCES "public"."bb_organisation"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bb_waste_listing" ADD CONSTRAINT "bb_waste_listing_templateId_bb_listing_template_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."bb_listing_template"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_event_org_idx" ON "bb_audit_event" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bid_listing_idx" ON "bb_bids" USING btree ("listingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bid_org_idx" ON "bb_bids" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carrier_listing_idx" ON "bb_carrier_assignment" USING btree ("listingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carrier_org_idx" ON "bb_carrier_assignment" USING btree ("carrierOrganisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carrier_assignment_org_idx" ON "bb_carrier_assignment" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_status_idx" ON "bb_incident" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_assignment_idx" ON "bb_incident" USING btree ("assignmentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_listing_idx" ON "bb_incident" USING btree ("listingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_org_idx" ON "bb_incident" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_org_idx" ON "bb_invoice" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_data_listing_idx" ON "bb_listing_template_data" USING btree ("listingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_data_template_idx" ON "bb_listing_template_data" USING btree ("templateId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_data_org_idx" ON "bb_listing_template_data" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_field_template_idx" ON "bb_listing_template_field" USING btree ("templateId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_field_section_idx" ON "bb_listing_template_field" USING btree ("sectionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_section_idx" ON "bb_listing_template_section" USING btree ("templateId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_org_idx" ON "bb_listing_template" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_org_idx" ON "bb_notification" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_org_idx" ON "bb_organisation_subscription" USING btree ("organisationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_token_unique" ON "bb_passwordResetToken" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_invoice_idx" ON "bb_payment" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_ticket_message_org_idx" ON "bb_support_ticket_message" USING btree ("organisationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_profile_unique" ON "bb_user_profile" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "bb_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_org_idx" ON "bb_user" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_role_idx" ON "bb_user" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_org_idx" ON "bb_waste_listing" USING btree ("organisationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_user_idx" ON "bb_waste_listing" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_archived_idx" ON "bb_waste_listing" USING btree ("archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_status_idx" ON "bb_waste_listing" USING btree ("status");