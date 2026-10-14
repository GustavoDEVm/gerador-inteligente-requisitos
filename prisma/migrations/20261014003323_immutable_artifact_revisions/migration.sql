-- CreateEnum
CREATE TYPE "RevisionOperation" AS ENUM ('BASELINE', 'CREATED', 'UPDATED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'CRITERION_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CRITERION_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE 'CRITERION_ARCHIVED';

-- AlterEnum
ALTER TYPE "ActivityEntityType" ADD VALUE 'ACCEPTANCE_CRITERION';

-- AlterTable
ALTER TABLE "acceptance_criteria" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "requirement_revisions" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "operation" "RevisionOperation" NOT NULL,
    "changed_by_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_story_revisions" (
    "id" UUID NOT NULL,
    "user_story_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "operation" "RevisionOperation" NOT NULL,
    "changed_by_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "archived_at" TIMESTAMP(3),
    "generated_by_analysis_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_story_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceptance_criterion_revisions" (
    "id" UUID NOT NULL,
    "acceptance_criterion_id" UUID NOT NULL,
    "user_story_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "operation" "RevisionOperation" NOT NULL,
    "changed_by_id" UUID,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_criterion_revisions_pkey" PRIMARY KEY ("id")
);

-- Backfill only the state known when immutable revision history is introduced.
-- Reusing the source identifier is safe because each revision table has its own
-- primary-key namespace and avoids requiring a PostgreSQL UUID extension.
-- Earlier states are intentionally not fabricated.
INSERT INTO "requirement_revisions" (
    "id", "requirement_id", "revision_number", "operation", "changed_by_id",
    "code", "title", "description", "type", "priority", "status", "archived_at"
)
SELECT
    "id", "id", "version", 'BASELINE', "created_by_id",
    "code", "title", "description", "type", "priority", "status", "archived_at"
FROM "requirements";

INSERT INTO "user_story_revisions" (
    "id", "user_story_id", "revision_number", "operation", "changed_by_id",
    "code", "title", "actor", "objective", "benefit", "description",
    "priority", "status", "archived_at", "generated_by_analysis_id"
)
SELECT
    "id", "id", "version", 'BASELINE', "created_by_id",
    "code", "title", "actor", "objective", "benefit", "description",
    "priority", "status", "archived_at", "generated_by_analysis_id"
FROM "user_stories";

INSERT INTO "acceptance_criterion_revisions" (
    "id", "acceptance_criterion_id", "user_story_id", "revision_number", "operation",
    "description", "position", "archived_at"
)
SELECT
    "id", "id", "user_story_id", "version", 'BASELINE',
    "description", "position", "archived_at"
FROM "acceptance_criteria";

-- CreateIndex
CREATE INDEX "requirement_revisions_requirement_id_created_at_idx" ON "requirement_revisions"("requirement_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_revisions_requirement_id_revision_number_key" ON "requirement_revisions"("requirement_id", "revision_number");

-- CreateIndex
CREATE INDEX "user_story_revisions_user_story_id_created_at_idx" ON "user_story_revisions"("user_story_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_story_revisions_user_story_id_revision_number_key" ON "user_story_revisions"("user_story_id", "revision_number");

-- CreateIndex
CREATE INDEX "acceptance_criterion_revisions_acceptance_criterion_id_crea_idx" ON "acceptance_criterion_revisions"("acceptance_criterion_id", "created_at");

-- CreateIndex
CREATE INDEX "acceptance_criterion_revisions_user_story_id_created_at_idx" ON "acceptance_criterion_revisions"("user_story_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "acceptance_criterion_revisions_acceptance_criterion_id_revi_key" ON "acceptance_criterion_revisions"("acceptance_criterion_id", "revision_number");

-- AddForeignKey
ALTER TABLE "requirement_revisions" ADD CONSTRAINT "requirement_revisions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_revisions" ADD CONSTRAINT "requirement_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_story_revisions" ADD CONSTRAINT "user_story_revisions_user_story_id_fkey" FOREIGN KEY ("user_story_id") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_story_revisions" ADD CONSTRAINT "user_story_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criterion_revisions" ADD CONSTRAINT "acceptance_criterion_revisions_acceptance_criterion_id_fkey" FOREIGN KEY ("acceptance_criterion_id") REFERENCES "acceptance_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criterion_revisions" ADD CONSTRAINT "acceptance_criterion_revisions_user_story_id_fkey" FOREIGN KEY ("user_story_id") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criterion_revisions" ADD CONSTRAINT "acceptance_criterion_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
