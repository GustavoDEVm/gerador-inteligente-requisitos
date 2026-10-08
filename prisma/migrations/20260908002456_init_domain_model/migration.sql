-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'IN_REVIEW', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('MANUAL', 'TEMPLATE', 'AI');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'REVIEWED', 'REJECTED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "AIAnalysisType" AS ENUM ('REQUIREMENT_EXTRACTION', 'AMBIGUITY_DETECTION', 'QUESTION_GENERATION', 'REFINEMENT', 'SUGGESTION_GENERATION');

-- CreateEnum
CREATE TYPE "AIAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INVALID_RESPONSE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AmbiguitySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AmbiguityStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ARCHIVED', 'SESSION_STARTED', 'SESSION_COMPLETED', 'QUESTION_ADDED', 'ANSWER_RECORDED', 'ANALYSIS_COMPLETED', 'REQUIREMENT_CREATED', 'REQUIREMENT_UPDATED', 'STORY_CREATED', 'STORY_UPDATED');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('PROJECT', 'SESSION', 'QUESTION', 'ANSWER', 'ANALYSIS', 'REQUIREMENT', 'USER_STORY', 'AMBIGUITY', 'SUGGESTION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholders" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elicitation_sessions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT,
    "context" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elicitation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elicitation_questions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "guidance" TEXT,
    "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
    "generated_by_analysis_id" UUID,
    "asked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elicitation_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elicitation_answers" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elicitation_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requested_by_id" UUID,
    "type" "AIAnalysisType" NOT NULL,
    "status" "AIAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "response_payload" JSONB,
    "structured_output" JSONB,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analysis_sessions" (
    "analysis_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_sessions_pkey" PRIMARY KEY ("analysis_id","session_id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_answer_sources" (
    "requirement_id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_answer_sources_pkey" PRIMARY KEY ("requirement_id","answer_id")
);

-- CreateTable
CREATE TABLE "requirement_analysis_sources" (
    "requirement_id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_analysis_sources_pkey" PRIMARY KEY ("requirement_id","analysis_id")
);

-- CreateTable
CREATE TABLE "user_stories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID,
    "generated_by_analysis_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_user_stories" (
    "requirement_id" UUID NOT NULL,
    "user_story_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_user_stories_pkey" PRIMARY KEY ("requirement_id","user_story_id")
);

-- CreateTable
CREATE TABLE "acceptance_criteria" (
    "id" UUID NOT NULL,
    "user_story_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acceptance_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ambiguities" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "generated_by_analysis_id" UUID,
    "resolved_by_id" UUID,
    "description" TEXT NOT NULL,
    "severity" "AmbiguitySeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "AmbiguityStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambiguities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "generated_by_analysis_id" UUID,
    "decided_by_id" UUID,
    "description" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" "ActivityAction" NOT NULL,
    "entity_type" "ActivityEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_owner_id_status_updated_at_idx" ON "projects"("owner_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "stakeholders_project_id_name_key" ON "stakeholders"("project_id", "name");

-- CreateIndex
CREATE INDEX "elicitation_sessions_project_id_status_created_at_idx" ON "elicitation_sessions"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "elicitation_sessions_project_id_sequence_key" ON "elicitation_sessions"("project_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "elicitation_questions_session_id_position_key" ON "elicitation_questions"("session_id", "position");

-- CreateIndex
CREATE INDEX "elicitation_answers_question_id_created_at_idx" ON "elicitation_answers"("question_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "elicitation_answers_question_id_version_key" ON "elicitation_answers"("question_id", "version");

-- CreateIndex
CREATE INDEX "ai_analyses_project_id_status_created_at_idx" ON "ai_analyses"("project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_analysis_sessions_session_id_idx" ON "ai_analysis_sessions"("session_id");

-- CreateIndex
CREATE INDEX "requirements_project_id_status_priority_idx" ON "requirements"("project_id", "status", "priority");

-- CreateIndex
CREATE INDEX "requirements_project_id_type_idx" ON "requirements"("project_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_project_id_code_key" ON "requirements"("project_id", "code");

-- CreateIndex
CREATE INDEX "requirement_answer_sources_answer_id_idx" ON "requirement_answer_sources"("answer_id");

-- CreateIndex
CREATE INDEX "requirement_analysis_sources_analysis_id_idx" ON "requirement_analysis_sources"("analysis_id");

-- CreateIndex
CREATE INDEX "user_stories_project_id_status_priority_idx" ON "user_stories"("project_id", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "user_stories_project_id_code_key" ON "user_stories"("project_id", "code");

-- CreateIndex
CREATE INDEX "requirement_user_stories_user_story_id_idx" ON "requirement_user_stories"("user_story_id");

-- CreateIndex
CREATE UNIQUE INDEX "acceptance_criteria_user_story_id_position_key" ON "acceptance_criteria"("user_story_id", "position");

-- CreateIndex
CREATE INDEX "ambiguities_project_id_status_severity_idx" ON "ambiguities"("project_id", "status", "severity");

-- CreateIndex
CREATE INDEX "suggestions_project_id_status_idx" ON "suggestions"("project_id", "status");

-- CreateIndex
CREATE INDEX "activity_logs_project_id_created_at_idx" ON "activity_logs"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_sessions" ADD CONSTRAINT "elicitation_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_sessions" ADD CONSTRAINT "elicitation_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_questions" ADD CONSTRAINT "elicitation_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "elicitation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_questions" ADD CONSTRAINT "elicitation_questions_generated_by_analysis_id_fkey" FOREIGN KEY ("generated_by_analysis_id") REFERENCES "ai_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_answers" ADD CONSTRAINT "elicitation_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "elicitation_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_answers" ADD CONSTRAINT "elicitation_answers_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_sessions" ADD CONSTRAINT "ai_analysis_sessions_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ai_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_sessions" ADD CONSTRAINT "ai_analysis_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "elicitation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_answer_sources" ADD CONSTRAINT "requirement_answer_sources_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_answer_sources" ADD CONSTRAINT "requirement_answer_sources_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "elicitation_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_analysis_sources" ADD CONSTRAINT "requirement_analysis_sources_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_analysis_sources" ADD CONSTRAINT "requirement_analysis_sources_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ai_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_generated_by_analysis_id_fkey" FOREIGN KEY ("generated_by_analysis_id") REFERENCES "ai_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_user_stories" ADD CONSTRAINT "requirement_user_stories_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_user_stories" ADD CONSTRAINT "requirement_user_stories_user_story_id_fkey" FOREIGN KEY ("user_story_id") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criteria" ADD CONSTRAINT "acceptance_criteria_user_story_id_fkey" FOREIGN KEY ("user_story_id") REFERENCES "user_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambiguities" ADD CONSTRAINT "ambiguities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambiguities" ADD CONSTRAINT "ambiguities_generated_by_analysis_id_fkey" FOREIGN KEY ("generated_by_analysis_id") REFERENCES "ai_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ambiguities" ADD CONSTRAINT "ambiguities_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_generated_by_analysis_id_fkey" FOREIGN KEY ("generated_by_analysis_id") REFERENCES "ai_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
