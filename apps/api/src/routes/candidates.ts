import { randomUUID } from "node:crypto";
import {
  candidateListQuerySchema,
  candidatePhotoRequestSchema,
  changeCandidateStatusSchema,
  createCandidateSchema,
  createEvaluationSchema,
  updateCandidateSchema
} from "@biddly/contracts";
import { Prisma, prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { validateCustomFieldValues } from "../lib/custom-fields.js";
import { normalizePhone } from "../lib/phone.js";
import { requireChapterRole } from "../lib/permissions.js";
import { createPrivateDownloadUrl, createPrivateUploadUrl, privateStorageUsage, storageConfigured } from "../lib/storage.js";

function extensionForContentType(contentType: string) {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "jpg";
}

async function saveCustomValues(
  tx: Prisma.TransactionClient,
  candidateId: string,
  definitions: { id: string; key: string }[],
  values: Record<string, unknown>
) {
  const byKey = new Map(definitions.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(values)) {
    const field = byKey.get(key);

    if (!field) {
      continue;
    }

    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

    if (empty) {
      await tx.candidateFieldValue.deleteMany({
        where: { candidateId, fieldId: field.id }
      });
      continue;
    }

    await tx.candidateFieldValue.upsert({
      where: {
        candidateId_fieldId: {
          candidateId,
          fieldId: field.id
        }
      },
      create: {
        candidateId,
        fieldId: field.id,
        value: value as Prisma.InputJsonValue
      },
      update: {
        value: value as Prisma.InputJsonValue
      }
    });
  }
}

export async function candidateRoutes(app: FastifyInstance) {
  app.get("/candidates", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = candidateListQuerySchema.safeParse(request.query);
    const user = request.authUser;

    if (!parsed.success || !user?.chapterId) {
      return reply.code(400).send({ error: "Invalid candidate list request" });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: user.chapterId },
      select: { activeRecruitmentCycleId: true }
    });

    const targetCycleId = parsed.data.cycleId ?? chapter?.activeRecruitmentCycleId;

    if (!targetCycleId) {
      return { items: [], page: parsed.data.page, pageSize: parsed.data.pageSize, total: 0, totalPages: 0 };
    }

    if (targetCycleId !== chapter?.activeRecruitmentCycleId && user.chapterRole === "MEMBER") {
      return reply.code(403).send({ error: "Archived recruitment cycles require moderator access" });
    }

    const targetCycle = await prisma.recruitmentCycle.findFirst({
      where: { id: targetCycleId, chapterId: user.chapterId },
      select: { id: true }
    });

    if (!targetCycle) {
      return reply.code(404).send({ error: "Recruitment cycle not found" });
    }

    const archivedFilter =
      parsed.data.archived === "active"
        ? { archivedAt: null }
        : parsed.data.archived === "archived"
          ? { archivedAt: { not: null } }
          : {};

    const where: Prisma.CandidateWhereInput = {
      chapterId: user.chapterId,
      recruitmentCycleId: targetCycleId,
      ...archivedFilter,
      ...(parsed.data.statusId ? { statusId: parsed.data.statusId } : {}),
      ...(parsed.data.q
        ? {
            OR: user.chapterRole === "MEMBER"
              ? [
                  { firstName: { contains: parsed.data.q, mode: "insensitive" as const } },
                  { lastName: { contains: parsed.data.q, mode: "insensitive" as const } }
                ]
              : [
                  { firstName: { contains: parsed.data.q, mode: "insensitive" as const } },
                  { lastName: { contains: parsed.data.q, mode: "insensitive" as const } },
                  { email: { contains: parsed.data.q, mode: "insensitive" as const } },
                  { phone: { contains: parsed.data.q } }
                ]
          }
        : {})
    };

    const orderBy: Prisma.CandidateOrderByWithRelationInput[] =
      parsed.data.sort === "recent"
        ? [{ createdAt: "desc" }]
        : parsed.data.sort === "name"
          ? [{ lastName: "asc" }, { firstName: "asc" }]
          : parsed.data.sort === "score_desc"
            ? [{ aggregate: { averageScore: "desc" } }, { lastName: "asc" }]
            : parsed.data.sort === "score_asc"
              ? [{ aggregate: { averageScore: "asc" } }, { lastName: "asc" }]
              : user.chapterRole === "MEMBER"
              ? [{ statusPosition: "asc" }, { lastName: "asc" }, { firstName: "asc" }]
              : [{ statusPosition: "asc" }, { aggregate: { averageScore: "desc" } }, { lastName: "asc" }];

    const skip = (parsed.data.page - 1) * parsed.data.pageSize;
    const [items, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        orderBy,
        skip,
        take: parsed.data.pageSize,
        include: {
          aggregate: true,
          status: true,
          evaluations: {
            where: { userId: user.id },
            select: { score: true, updatedAt: true },
            take: 1
          }
        }
      }),
      prisma.candidate.count({ where })
    ]);

    const photoUrls = user.chapterRole === "MEMBER"
      ? await Promise.all(items.map((candidate) => candidate.photoKey ? createPrivateDownloadUrl(candidate.photoKey).catch(() => null) : Promise.resolve(null)))
      : items.map(() => null);

    return {
      items: items.map((candidate, index) => ({
        ...candidate,
        email: user.chapterRole === "MEMBER" ? undefined : candidate.email,
        phone: user.chapterRole === "MEMBER" ? undefined : candidate.phone,
        aggregate: user.chapterRole === "MEMBER" ? undefined : candidate.aggregate,
        myEvaluation: candidate.evaluations[0] ?? null,
        evaluations: undefined,
        hasPhoto: Boolean(candidate.photoKey),
        photoUrl: photoUrls[index],
        photoKey: undefined
      })),
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total,
      totalPages: Math.ceil(total / parsed.data.pageSize)
    };
  });

  app.post(
    "/candidates",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const parsed = createCandidateSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid candidate" });
      }

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const chapter = await prisma.chapter.findUnique({
        where: { id: user.chapterId },
        include: {
          activeRecruitmentCycle: {
            include: {
              statuses: { orderBy: { position: "asc" }, take: 1 },
              fieldDefinitions: true
            }
          }
        }
      });

      const cycle = chapter?.activeRecruitmentCycle;
      const firstStatus = cycle?.statuses[0];

      if (!cycle || !firstStatus) {
        return reply.code(409).send({ error: "Chapter has no active recruitment cycle" });
      }

      const validation = validateCustomFieldValues(cycle.fieldDefinitions, parsed.data.customFields, false, true);

      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      const candidate = await prisma.$transaction(async (tx) => {
        const created = await tx.candidate.create({
          data: {
            chapterId: user.chapterId!,
            recruitmentCycleId: cycle.id,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            phone: normalizePhone(parsed.data.phone),
            email: parsed.data.email ?? null,
            statusId: firstStatus.id,
            statusPosition: firstStatus.position,
            createdById: user.id,
            source: "MANUAL",
            aggregate: { create: {} }
          }
        });

        await saveCustomValues(tx, created.id, validation.fields, parsed.data.customFields);
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CANDIDATE_CREATED",
          targetType: "Candidate",
          targetId: created.id,
          metadata: { source: "MANUAL" }
        });

        return created;
      });

      return reply.code(201).send(candidate);
    }
  );

  app.get("/candidates/:candidateId", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;
    const { candidateId } = request.params as { candidateId: string };

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, chapterId: user.chapterId },
      include: {
        status: true,
        aggregate: true,
        customValues: {
          include: { field: true },
          orderBy: { field: { position: "asc" } }
        },
        evaluations: {
          where: { userId: user.id },
          select: { id: true, score: true, updatedAt: true },
          take: 1
        },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            fromStatus: { select: { id: true, name: true } },
            toStatus: { select: { id: true, name: true } },
            changedBy: { select: { id: true, firstName: true, lastName: true } }
          }
        },
        _count: { select: { comments: true } }
      }
    });

    if (!candidate) {
      return reply.code(404).send({ error: "Candidate not found" });
    }

    if (user.chapterRole === "MEMBER") {
      const chapter = await prisma.chapter.findUnique({
        where: { id: user.chapterId },
        select: { activeRecruitmentCycleId: true }
      });

      if (candidate.archivedAt || candidate.recruitmentCycleId !== chapter?.activeRecruitmentCycleId) {
        return reply.code(403).send({ error: "Archived candidate access requires moderator permissions" });
      }
    }

    return {
      ...candidate,
      email: user.chapterRole === "MEMBER" ? undefined : candidate.email,
      phone: user.chapterRole === "MEMBER" ? undefined : candidate.phone,
      aggregate: user.chapterRole === "MEMBER" ? undefined : candidate.aggregate,
      statusHistory: user.chapterRole === "MEMBER" ? undefined : candidate.statusHistory,
      createdById: user.chapterRole === "MEMBER" ? undefined : candidate.createdById,
      myEvaluation: candidate.evaluations[0] ?? null,
      evaluations: undefined,
      hasPhoto: Boolean(candidate.photoKey),
      photoKey: undefined
    };
  });

  app.patch(
    "/candidates/:candidateId",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const parsed = updateCandidateSchema.safeParse(request.body);
      const user = request.authUser;
      const { candidateId } = request.params as { candidateId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid candidate update" });
      }

      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, chapterId: user.chapterId },
        include: { recruitmentCycle: { include: { fieldDefinitions: true } } }
      });

      if (!candidate) {
        return reply.code(404).send({ error: "Candidate not found" });
      }

      const customFields = parsed.data.customFields ?? {};
      const validation = validateCustomFieldValues(
        candidate.recruitmentCycle.fieldDefinitions,
        customFields,
        false,
        false
      );

      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.candidate.update({
          where: { id: candidate.id },
          data: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            phone: parsed.data.phone === undefined ? undefined : normalizePhone(parsed.data.phone),
            email: parsed.data.email === undefined ? undefined : parsed.data.email
          }
        });

        if (parsed.data.customFields) {
          await saveCustomValues(tx, candidate.id, validation.fields, customFields);
        }

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CANDIDATE_UPDATED",
          targetType: "Candidate",
          targetId: candidate.id
        });

        return saved;
      });

      return updated;
    }
  );

  app.post(
    "/candidates/:candidateId/archive",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const user = request.authUser;
      const { candidateId } = request.params as { candidateId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, chapterId: user.chapterId }
      });

      if (!candidate) {
        return reply.code(404).send({ error: "Candidate not found" });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.candidate.update({
          where: { id: candidate.id },
          data: { archivedAt: new Date(), archivedById: user.id }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CANDIDATE_ARCHIVED",
          targetType: "Candidate",
          targetId: candidate.id
        });
        return saved;
      });

      return updated;
    }
  );

  app.post(
    "/candidates/:candidateId/restore",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const user = request.authUser;
      const { candidateId } = request.params as { candidateId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, chapterId: user.chapterId }
      });

      if (!candidate) {
        return reply.code(404).send({ error: "Candidate not found" });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.candidate.update({
          where: { id: candidate.id },
          data: { archivedAt: null, archivedById: null }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CANDIDATE_RESTORED",
          targetType: "Candidate",
          targetId: candidate.id
        });
        return saved;
      });

      return updated;
    }
  );

  app.patch(
    "/candidates/:candidateId/status",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const parsed = changeCandidateStatusSchema.safeParse(request.body);
      const user = request.authUser;
      const { candidateId } = request.params as { candidateId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid status change" });
      }

      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, chapterId: user.chapterId },
        include: { status: true }
      });

      if (!candidate) {
        return reply.code(404).send({ error: "Candidate not found" });
      }

      const nextStatus = await prisma.candidateStatus.findFirst({
        where: { id: parsed.data.statusId, recruitmentCycleId: candidate.recruitmentCycleId }
      });

      if (!nextStatus) {
        return reply.code(404).send({ error: "Status not found" });
      }

      if (nextStatus.id === candidate.statusId) {
        return candidate;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.candidate.update({
          where: { id: candidate.id },
          data: { statusId: nextStatus.id, statusPosition: nextStatus.position }
        });
        await tx.candidateStatusHistory.create({
          data: {
            candidateId: candidate.id,
            chapterId: user.chapterId!,
            recruitmentCycleId: candidate.recruitmentCycleId,
            fromStatusId: candidate.statusId,
            toStatusId: nextStatus.id,
            changedById: user.id
          }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CANDIDATE_STATUS_CHANGED",
          targetType: "Candidate",
          targetId: candidate.id,
          metadata: {
            fromStatusId: candidate.statusId,
            fromStatusName: candidate.status.name,
            toStatusId: nextStatus.id,
            toStatusName: nextStatus.name
          }
        });
        return saved;
      });

      return updated;
    }
  );

  app.post("/candidates/:candidateId/evaluations", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = createEvaluationSchema.safeParse(request.body);
    const user = request.authUser;
    const { candidateId } = request.params as { candidateId: string };

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid evaluation" });
    }

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const [candidate, settings] = await Promise.all([
      prisma.candidate.findFirst({
        where: {
          id: candidateId,
          chapterId: user.chapterId,
          archivedAt: null,
          recruitmentCycle: { status: "ACTIVE" }
        }
      }),
      prisma.chapterSettings.findUnique({ where: { chapterId: user.chapterId } })
    ]);

    if (!candidate) {
      return reply.code(404).send({ error: "Candidate not found in the active recruitment cycle" });
    }

    const min = settings?.scoreMin ?? 1;
    const max = settings?.scoreMax ?? 10;
    const step = settings?.scoreStep ?? 1;
    const score = parsed.data.score;
    const distance = Math.abs((score - min) / step - Math.round((score - min) / step));

    if (score < min || score > max || distance > 1e-9) {
      return reply.code(400).send({ error: `Score must be between ${min} and ${max} in increments of ${step}` });
    }

    const evaluation = await prisma.$transaction(async (tx) => {
      const saved = await tx.evaluation.upsert({
        where: { candidateId_userId: { candidateId, userId: user.id } },
        create: {
          chapterId: user.chapterId!,
          recruitmentCycleId: candidate.recruitmentCycleId,
          candidateId,
          userId: user.id,
          score
        },
        update: { score }
      });

      const stats = await tx.evaluation.aggregate({
        where: { candidateId },
        _avg: { score: true },
        _count: { score: true }
      });

      await tx.candidateAggregate.upsert({
        where: { candidateId },
        create: {
          candidateId,
          averageScore: stats._avg.score ?? 0,
          evaluationCount: stats._count.score
        },
        update: {
          averageScore: stats._avg.score ?? 0,
          evaluationCount: stats._count.score
        }
      });

      return saved;
    });

    return evaluation;
  });

  app.post(
    "/candidates/:candidateId/photo-upload",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const parsed = candidatePhotoRequestSchema.safeParse(request.body);
      const user = request.authUser;
      const { candidateId } = request.params as { candidateId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid photo upload request" });
      }

      if (!storageConfigured()) {
        return reply.code(503).send({ error: "Object storage is not configured" });
      }

      const [candidate, chapter] = await Promise.all([
        prisma.candidate.findFirst({ where: { id: candidateId, chapterId: user.chapterId } }),
        prisma.chapter.findUnique({ where: { id: user.chapterId }, select: { storageQuotaBytes: true } })
      ]);

      if (!candidate) {
        return reply.code(404).send({ error: "Candidate not found" });
      }

      if (chapter?.storageQuotaBytes !== null && chapter?.storageQuotaBytes !== undefined) {
        const usage = await privateStorageUsage(`candidate-photos/${user.chapterId}/`);
        if (usage && BigInt(usage.totalBytes + parsed.data.byteLength) > chapter.storageQuotaBytes) {
          return reply.code(413).send({ error: "Workspace storage quota reached" });
        }
      }

      const key = `candidate-photos/${user.chapterId}/${candidate.recruitmentCycleId}/${candidate.id}/${randomUUID()}.${extensionForContentType(parsed.data.contentType)}`;
      const uploadUrl = await createPrivateUploadUrl(key, parsed.data.contentType, parsed.data.byteLength);

      if (!uploadUrl) {
        return reply.code(503).send({ error: "Object storage is not configured" });
      }

      await prisma.candidate.update({ where: { id: candidate.id }, data: { photoKey: key } });

      return { uploadUrl, key, expiresInSeconds: 600 };
    }
  );

  app.get("/candidates/:candidateId/photo", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;
    const { candidateId } = request.params as { candidateId: string };

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, chapterId: user.chapterId },
      select: { photoKey: true }
    });

    if (!candidate?.photoKey) {
      return reply.code(404).send({ error: "Candidate photo not found" });
    }

    const url = await createPrivateDownloadUrl(candidate.photoKey);

    if (!url) {
      return reply.code(503).send({ error: "Object storage is not configured" });
    }

    return { url, expiresInSeconds: 300 };
  });
}
