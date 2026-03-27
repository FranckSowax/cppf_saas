-- ============================================
-- Migration: Banking Contacts + Dynamic Segments
-- Rename enum Segment → ContactCategory
-- Enrich Contact model with banking fields
-- Create Segment model (dynamic targeting)
-- Update Campaign model (segmentId, inlineCriteria)
-- Create EnrichmentLog model (audit trail)
-- ============================================

-- 1. Rename enum Segment → ContactCategory
ALTER TYPE "Segment" RENAME TO "ContactCategory";

-- 2. Rename Contact.segment → Contact.category
ALTER TABLE "contacts" RENAME COLUMN "segment" TO "category";

-- 3. Add banking fields to contacts
ALTER TABLE "contacts" ADD COLUMN "city" TEXT;
ALTER TABLE "contacts" ADD COLUMN "country" TEXT DEFAULT 'GA';
ALTER TABLE "contacts" ADD COLUMN "ageRange" TEXT;
ALTER TABLE "contacts" ADD COLUMN "gender" TEXT;
ALTER TABLE "contacts" ADD COLUMN "language" TEXT DEFAULT 'fr';
ALTER TABLE "contacts" ADD COLUMN "accountType" TEXT;
ALTER TABLE "contacts" ADD COLUMN "registrationDate" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN "customAttributes" JSONB DEFAULT '{}';
ALTER TABLE "contacts" ADD COLUMN "engagementScore" INTEGER DEFAULT 0;
ALTER TABLE "contacts" ADD COLUMN "lastCampaignInteraction" TIMESTAMP(3);

-- 4. Update indexes on contacts
DROP INDEX IF EXISTS "contacts_segment_idx";
CREATE INDEX "contacts_category_idx" ON "contacts"("category");
CREATE INDEX "contacts_city_idx" ON "contacts"("city");
CREATE INDEX "contacts_accountType_idx" ON "contacts"("accountType");

-- 5. Create SegmentType enum
CREATE TYPE "SegmentType" AS ENUM ('STATIC', 'DYNAMIC', 'BANK_CRITERIA');

-- 6. Create segments table
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "SegmentType" NOT NULL DEFAULT 'DYNAMIC',
    "criteria" JSONB NOT NULL,
    "contactCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "segments_name_key" ON "segments"("name");

-- 7. Update campaigns table
-- Rename segment → legacySegment and make nullable
ALTER TABLE "campaigns" RENAME COLUMN "segment" TO "legacySegment";
ALTER TABLE "campaigns" ALTER COLUMN "legacySegment" DROP NOT NULL;

-- Add new segmentation columns
ALTER TABLE "campaigns" ADD COLUMN "segmentId" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "inlineCriteria" JSONB;

-- Add foreign key for segmentId
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "campaigns_segmentId_idx" ON "campaigns"("segmentId");

-- 8. Create enrichment_logs table
CREATE TABLE "enrichment_logs" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "enrichment_logs_contactId_idx" ON "enrichment_logs"("contactId");
