ALTER TABLE "CandidateStatusHistory" DROP CONSTRAINT "CandidateStatusHistory_toStatusId_fkey";

ALTER TABLE "CandidateStatusHistory" ALTER COLUMN "toStatusId" DROP NOT NULL;

ALTER TABLE "CandidateStatusHistory"
ADD CONSTRAINT "CandidateStatusHistory_toStatusId_fkey"
FOREIGN KEY ("toStatusId") REFERENCES "CandidateStatus"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
