-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "ChapterRole" AS ENUM ('MEMBER', 'MODERATOR', 'CHAPTER_ADMIN');

-- CreateEnum
CREATE TYPE "RecruitmentCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('MANUAL', 'IMPORT', 'PUBLIC_FORM');

-- CreateEnum
CREATE TYPE "CandidateFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'YEAR', 'SELECT', 'MULTI_SELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "PublicFieldMode" AS ENUM ('HIDDEN', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "CommentState" AS ENUM ('VISIBLE', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "ModerationReportStatus" AS ENUM ('PENDING', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "ModerationReportReason" AS ENUM ('INAPPROPRIATE', 'PERSONAL_ATTACK', 'SENSITIVE_INFORMATION', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionTerm" AS ENUM ('SEMESTER', 'ACADEMIC_YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CHAPTER_CREATED', 'CHAPTER_UPDATED', 'BRANDING_UPDATED', 'SETTINGS_UPDATED', 'MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', 'INVITE_REVOKED', 'CYCLE_CREATED', 'CYCLE_UPDATED', 'CYCLE_ACTIVATED', 'CYCLE_ARCHIVED', 'STATUS_CREATED', 'STATUS_UPDATED', 'STATUS_DELETED', 'FIELD_CREATED', 'FIELD_UPDATED', 'FIELD_DELETED', 'FORM_UPDATED', 'CANDIDATE_CREATED', 'CANDIDATE_UPDATED', 'CANDIDATE_ARCHIVED', 'CANDIDATE_RESTORED', 'CANDIDATE_STATUS_CHANGED', 'EVALUATION_UPDATED', 'COMMENT_CREATED', 'COMMENT_UPDATED', 'COMMENT_HIDDEN', 'COMMENT_RESTORED', 'COMMENT_REMOVED', 'REPORT_RESOLVED', 'IMPORT_COMPLETED', 'EXPORT_CREATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT NOT NULL,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "logoUrl" TEXT,
    "crestUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeRecruitmentCycleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterBranding" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "logoUrl" TEXT,
    "crestUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSettings" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repliesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reactionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scoreMin" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scoreMax" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "scoreStep" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "role" "ChapterRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organizationId" TEXT,
    "universityId" TEXT,
    "chapterName" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "acceptedChapterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterInvite" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "email" TEXT,
    "label" TEXT,
    "role" "ChapterRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "code" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterInviteUse" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterInviteUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentCycle" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecruitmentCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateStatus" (
    "id" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" TEXT,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateFieldDefinition" (
    "id" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CandidateFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visibleOnPublicForm" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "options" JSONB,
    "validation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicRecruitmentForm" (
    "id" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "introText" TEXT,
    "confirmationMessage" TEXT,
    "emailMode" "PublicFieldMode" NOT NULL DEFAULT 'OPTIONAL',
    "phoneMode" "PublicFieldMode" NOT NULL DEFAULT 'REQUIRED',
    "photoMode" "PublicFieldMode" NOT NULL DEFAULT 'OPTIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicRecruitmentForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "statusPosition" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "photoKey" TEXT,
    "source" "CandidateSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateFieldValue" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAggregate" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "averageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evaluationCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateStatusHistory" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "state" "CommentState" NOT NULL DEFAULT 'VISIBLE',
    "moderatedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReaction" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReport" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "recruitmentCycleId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reason" "ModerationReportReason" NOT NULL,
    "details" TEXT,
    "status" "ModerationReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSubscription" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "term" "SubscriptionTerm" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "University_name_key" ON "University"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_slug_key" ON "Chapter"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_activeRecruitmentCycleId_key" ON "Chapter"("activeRecruitmentCycleId");

-- CreateIndex
CREATE INDEX "Chapter_organizationId_idx" ON "Chapter"("organizationId");

-- CreateIndex
CREATE INDEX "Chapter_universityId_idx" ON "Chapter"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_organizationId_universityId_key" ON "Chapter"("organizationId", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterBranding_chapterId_key" ON "ChapterBranding"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSettings_chapterId_key" ON "ChapterSettings"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterMembership_userId_key" ON "ChapterMembership"("userId");

-- CreateIndex
CREATE INDEX "ChapterMembership_chapterId_role_idx" ON "ChapterMembership"("chapterId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_email_idx" ON "WorkspaceInvite"("email");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_expiresAt_idx" ON "WorkspaceInvite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterInvite_tokenHash_key" ON "ChapterInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterInvite_code_key" ON "ChapterInvite"("code");

-- CreateIndex
CREATE INDEX "ChapterInvite_chapterId_email_idx" ON "ChapterInvite"("chapterId", "email");

-- CreateIndex
CREATE INDEX "ChapterInvite_expiresAt_idx" ON "ChapterInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "ChapterInvite_chapterId_revokedAt_idx" ON "ChapterInvite"("chapterId", "revokedAt");

-- CreateIndex
CREATE INDEX "ChapterInviteUse_userId_idx" ON "ChapterInviteUse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterInviteUse_inviteId_userId_key" ON "ChapterInviteUse"("inviteId", "userId");

-- CreateIndex
CREATE INDEX "RecruitmentCycle_chapterId_status_idx" ON "RecruitmentCycle"("chapterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentCycle_chapterId_name_key" ON "RecruitmentCycle"("chapterId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateStatus_recruitmentCycleId_name_key" ON "CandidateStatus"("recruitmentCycleId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateStatus_recruitmentCycleId_position_key" ON "CandidateStatus"("recruitmentCycleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateFieldDefinition_recruitmentCycleId_key_key" ON "CandidateFieldDefinition"("recruitmentCycleId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateFieldDefinition_recruitmentCycleId_position_key" ON "CandidateFieldDefinition"("recruitmentCycleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PublicRecruitmentForm_recruitmentCycleId_key" ON "PublicRecruitmentForm"("recruitmentCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicRecruitmentForm_slug_key" ON "PublicRecruitmentForm"("slug");

-- CreateIndex
CREATE INDEX "Candidate_chapterId_recruitmentCycleId_archivedAt_idx" ON "Candidate"("chapterId", "recruitmentCycleId", "archivedAt");

-- CreateIndex
CREATE INDEX "Candidate_chapterId_recruitmentCycleId_statusPosition_idx" ON "Candidate"("chapterId", "recruitmentCycleId", "statusPosition");

-- CreateIndex
CREATE INDEX "Candidate_chapterId_lastName_firstName_idx" ON "Candidate"("chapterId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Candidate_recruitmentCycleId_email_idx" ON "Candidate"("recruitmentCycleId", "email");

-- CreateIndex
CREATE INDEX "Candidate_recruitmentCycleId_phone_idx" ON "Candidate"("recruitmentCycleId", "phone");

-- CreateIndex
CREATE INDEX "CandidateFieldValue_fieldId_idx" ON "CandidateFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateFieldValue_candidateId_fieldId_key" ON "CandidateFieldValue"("candidateId", "fieldId");

-- CreateIndex
CREATE INDEX "Evaluation_chapterId_recruitmentCycleId_idx" ON "Evaluation"("chapterId", "recruitmentCycleId");

-- CreateIndex
CREATE INDEX "Evaluation_candidateId_score_idx" ON "Evaluation"("candidateId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_candidateId_userId_key" ON "Evaluation"("candidateId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAggregate_candidateId_key" ON "CandidateAggregate"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateStatusHistory_chapterId_recruitmentCycleId_created_idx" ON "CandidateStatusHistory"("chapterId", "recruitmentCycleId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateStatusHistory_candidateId_createdAt_idx" ON "CandidateStatusHistory"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_chapterId_candidateId_createdAt_idx" ON "Comment"("chapterId", "candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "CommentReaction_chapterId_commentId_idx" ON "CommentReaction"("chapterId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReaction_commentId_userId_emoji_key" ON "CommentReaction"("commentId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "ModerationReport_chapterId_status_createdAt_idx" ON "ModerationReport"("chapterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationReport_commentId_idx" ON "ModerationReport"("commentId");

-- CreateIndex
CREATE INDEX "AuditLog_chapterId_createdAt_idx" ON "AuditLog"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_chapterId_action_idx" ON "AuditLog"("chapterId", "action");

-- CreateIndex
CREATE INDEX "ChapterSubscription_chapterId_status_periodEnd_idx" ON "ChapterSubscription"("chapterId", "status", "periodEnd");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_activeRecruitmentCycleId_fkey" FOREIGN KEY ("activeRecruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterBranding" ADD CONSTRAINT "ChapterBranding_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSettings" ADD CONSTRAINT "ChapterSettings_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterMembership" ADD CONSTRAINT "ChapterMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterMembership" ADD CONSTRAINT "ChapterMembership_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInvite" ADD CONSTRAINT "ChapterInvite_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInvite" ADD CONSTRAINT "ChapterInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInviteUse" ADD CONSTRAINT "ChapterInviteUse_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ChapterInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterInviteUse" ADD CONSTRAINT "ChapterInviteUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCycle" ADD CONSTRAINT "RecruitmentCycle_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCycle" ADD CONSTRAINT "RecruitmentCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStatus" ADD CONSTRAINT "CandidateStatus_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFieldDefinition" ADD CONSTRAINT "CandidateFieldDefinition_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicRecruitmentForm" ADD CONSTRAINT "PublicRecruitmentForm_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "CandidateStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFieldValue" ADD CONSTRAINT "CandidateFieldValue_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFieldValue" ADD CONSTRAINT "CandidateFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CandidateFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAggregate" ADD CONSTRAINT "CandidateAggregate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStatusHistory" ADD CONSTRAINT "CandidateStatusHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStatusHistory" ADD CONSTRAINT "CandidateStatusHistory_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStatusHistory" ADD CONSTRAINT "CandidateStatusHistory_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "CandidateStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStatusHistory" ADD CONSTRAINT "CandidateStatusHistory_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "CandidateStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStatusHistory" ADD CONSTRAINT "CandidateStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_recruitmentCycleId_fkey" FOREIGN KEY ("recruitmentCycleId") REFERENCES "RecruitmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSubscription" ADD CONSTRAINT "ChapterSubscription_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
