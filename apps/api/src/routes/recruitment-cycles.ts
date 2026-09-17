import { randomUUID } from "node:crypto";
import {
  candidateFieldSchema,
  candidateStatusSchema,
  createRecruitmentCycleSchema,
  publicFormSettingsSchema,
  reorderFieldsSchema,
  reorderStatusesSchema,
  updateCandidateFieldSchema,
  updateRecruitmentCycleSchema
} from "@biddly/contracts";
import { Prisma, prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { requireChapterRole } from "../lib/permissions.js";
import { slugify } from "../lib/slug.js";

const defaultStatuses = [
  { name: "New", position: 0 },
  { name: "Contacted", position: 1 },
  { name: "Interested", position: 2 },
  { name: "Priority", position: 3 },
  { name: "Bid Extended", position: 4 },
  { name: "Accepted", position: 5, isTerminal: true },
  { name: "Closed", position: 6, isTerminal: true }
];

async function getOwnedCycle(chapterId: string, cycleId: string) {
  return prisma.recruitmentCycle.findFirst({
    where: { id: cycleId, chapterId }
  });
}

export async function recruitmentCycleRoutes(app: FastifyInstance) {
  app.get("/recruitment-cycles", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    return prisma.recruitmentCycle.findMany({
      where: { chapterId: user.chapterId },
      orderBy: { createdAt: "desc" },
      include: {
        publicForm: true,
        _count: { select: { candidates: true } }
      }
    });
  });

  app.post(
    "/recruitment-cycles",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = createRecruitmentCycleSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid recruitment cycle" });
      }

      const chapter = await prisma.chapter.findUnique({
        where: { id: user.chapterId },
        select: { slug: true }
      });

      if (!chapter) {
        return reply.code(404).send({ error: "Chapter not found" });
      }

      const formSlug = `${chapter.slug}-${slugify(parsed.data.name)}-${randomUUID().slice(0, 8)}`;

      try {
        const cycle = await prisma.$transaction(async (tx) => {
          const created = await tx.recruitmentCycle.create({
            data: {
              chapterId: user.chapterId!,
              name: parsed.data.name,
              startsAt: parsed.data.startsAt ?? null,
              endsAt: parsed.data.endsAt ?? null,
              createdById: user.id,
              statuses: { create: defaultStatuses },
              publicForm: {
                create: {
                  slug: formSlug,
                  title: `${parsed.data.name} Recruitment Form`,
                  confirmationMessage: "Thanks for your interest. Your information has been submitted."
                }
              }
            },
            include: {
              statuses: { orderBy: { position: "asc" } },
              publicForm: true
            }
          });

          await writeAudit(tx, {
            chapterId: user.chapterId!,
            actorId: user.id,
            action: "CYCLE_CREATED",
            targetType: "RecruitmentCycle",
            targetId: created.id,
            metadata: { name: created.name }
          });

          return created;
        });

        return reply.code(201).send(cycle);
      } catch {
        return reply.code(409).send({ error: "A recruitment cycle with that name already exists" });
      }
    }
  );

  app.get("/recruitment-cycles/:cycleId", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;
    const { cycleId } = request.params as { cycleId: string };

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const cycle = await prisma.recruitmentCycle.findFirst({
      where: { id: cycleId, chapterId: user.chapterId },
      include: {
        statuses: {
          orderBy: { position: "asc" },
          include: { _count: { select: { candidates: true, historyTo: true } } }
        },
        fieldDefinitions: { orderBy: { position: "asc" } },
        publicForm: true,
        _count: { select: { candidates: true, evaluations: true, comments: true } }
      }
    });

    if (!cycle) {
      return reply.code(404).send({ error: "Recruitment cycle not found" });
    }

    return cycle;
  });

  app.patch(
    "/recruitment-cycles/:cycleId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = updateRecruitmentCycleSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid recruitment cycle update" });
      }

      const cycle = await getOwnedCycle(user.chapterId, cycleId);

      if (!cycle) {
        return reply.code(404).send({ error: "Recruitment cycle not found" });
      }

      const nextStartsAt = parsed.data.startsAt === undefined ? cycle.startsAt : parsed.data.startsAt;
      const nextEndsAt = parsed.data.endsAt === undefined ? cycle.endsAt : parsed.data.endsAt;

      if (nextStartsAt && nextEndsAt && nextEndsAt <= nextStartsAt) {
        return reply.code(400).send({ error: "endsAt must be after startsAt" });
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const saved = await tx.recruitmentCycle.update({
            where: { id: cycle.id },
            data: {
              ...parsed.data,
              startsAt: parsed.data.startsAt === undefined ? undefined : parsed.data.startsAt,
              endsAt: parsed.data.endsAt === undefined ? undefined : parsed.data.endsAt
            }
          });

          await writeAudit(tx, {
            chapterId: user.chapterId!,
            actorId: user.id,
            action: "CYCLE_UPDATED",
            targetType: "RecruitmentCycle",
            targetId: cycle.id,
            metadata: { name: saved.name }
          });

          return saved;
        });

        return updated;
      } catch {
        return reply.code(409).send({ error: "A recruitment cycle with that name already exists" });
      }
    }
  );

  app.post(
    "/recruitment-cycles/:cycleId/activate",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const cycle = await getOwnedCycle(user.chapterId, cycleId);

      if (!cycle) {
        return reply.code(404).send({ error: "Recruitment cycle not found" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.recruitmentCycle.updateMany({
          where: { chapterId: user.chapterId!, status: "ACTIVE", id: { not: cycleId } },
          data: { status: "ARCHIVED" }
        });
        await tx.recruitmentCycle.update({ where: { id: cycleId }, data: { status: "ACTIVE" } });
        await tx.chapter.update({
          where: { id: user.chapterId! },
          data: { activeRecruitmentCycleId: cycleId }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CYCLE_ACTIVATED",
          targetType: "RecruitmentCycle",
          targetId: cycleId
        });
      });

      return { activeRecruitmentCycleId: cycleId };
    }
  );

  app.post(
    "/recruitment-cycles/:cycleId/archive",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const cycle = await getOwnedCycle(user.chapterId, cycleId);

      if (!cycle) {
        return reply.code(404).send({ error: "Recruitment cycle not found" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.recruitmentCycle.update({ where: { id: cycleId }, data: { status: "ARCHIVED" } });
        await tx.chapter.updateMany({
          where: { id: user.chapterId!, activeRecruitmentCycleId: cycleId },
          data: { activeRecruitmentCycleId: null }
        });
        await tx.publicRecruitmentForm.updateMany({
          where: { recruitmentCycleId: cycleId },
          data: { isOpen: false }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CYCLE_ARCHIVED",
          targetType: "RecruitmentCycle",
          targetId: cycleId
        });
      });

      return { archived: true };
    }
  );

  app.post(
    "/recruitment-cycles/:cycleId/unarchive",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const cycle = await getOwnedCycle(user.chapterId, cycleId);

      if (!cycle) {
        return reply.code(404).send({ error: "Recruitment cycle not found" });
      }

      if (cycle.status !== "ARCHIVED") {
        return reply.code(409).send({ error: "Only archived recruitment cycles can be restored" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.recruitmentCycle.update({ where: { id: cycleId }, data: { status: "DRAFT" } });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "CYCLE_UPDATED",
          targetType: "RecruitmentCycle",
          targetId: cycleId,
          metadata: { status: "DRAFT", restoredFromArchive: true }
        });
      });

      return { restored: true, status: "DRAFT" };
    }
  );

  app.post(
    "/recruitment-cycles/:cycleId/statuses",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = candidateStatusSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid status" });
      }

      const cycle = await getOwnedCycle(user.chapterId, cycleId);

      if (!cycle) {
        return reply.code(404).send({ error: "Recruitment cycle not found" });
      }

      const maxPosition = await prisma.candidateStatus.aggregate({
        where: { recruitmentCycleId: cycleId },
        _max: { position: true }
      });

      try {
        const status = await prisma.$transaction(async (tx) => {
          const created = await tx.candidateStatus.create({
            data: {
              recruitmentCycleId: cycleId,
              name: parsed.data.name,
              color: parsed.data.color ?? null,
              isTerminal: parsed.data.isTerminal,
              position: (maxPosition._max.position ?? -1) + 1
            }
          });
          await writeAudit(tx, {
            chapterId: user.chapterId!,
            actorId: user.id,
            action: "STATUS_CREATED",
            targetType: "CandidateStatus",
            targetId: created.id,
            metadata: { cycleId, name: created.name }
          });
          return created;
        });
        return reply.code(201).send(status);
      } catch {
        return reply.code(409).send({ error: "A status with that name already exists" });
      }
    }
  );

  app.patch(
    "/recruitment-cycles/:cycleId/statuses/:statusId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = candidateStatusSchema.partial().safeParse(request.body);
      const user = request.authUser;
      const { cycleId, statusId } = request.params as { cycleId: string; statusId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid status update" });
      }

      const status = await prisma.candidateStatus.findFirst({
        where: { id: statusId, recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } }
      });

      if (!status) {
        return reply.code(404).send({ error: "Status not found" });
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const saved = await tx.candidateStatus.update({ where: { id: statusId }, data: parsed.data });
          await writeAudit(tx, {
            chapterId: user.chapterId!,
            actorId: user.id,
            action: "STATUS_UPDATED",
            targetType: "CandidateStatus",
            targetId: statusId,
            metadata: { cycleId }
          });
          return saved;
        });
        return updated;
      } catch {
        return reply.code(409).send({ error: "A status with that name already exists" });
      }
    }
  );

  app.delete(
    "/recruitment-cycles/:cycleId/statuses/:statusId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { cycleId, statusId } = request.params as { cycleId: string; statusId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const status = await prisma.candidateStatus.findFirst({
        where: { id: statusId, recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } },
        include: { _count: { select: { candidates: true, historyTo: true } } }
      });

      if (!status) {
        return reply.code(404).send({ error: "Status not found" });
      }

      if (status._count.candidates > 0) {
        const noun = status._count.candidates === 1 ? "PNM is" : "PNMs are";
        return reply.code(409).send({
          error: `${status._count.candidates} ${noun} still assigned to this status. Move them to another status before removing it.`
        });
      }

      const count = await prisma.candidateStatus.count({ where: { recruitmentCycleId: cycleId } });
      if (count <= 1) {
        return reply.code(409).send({ error: "A recruitment cycle must have at least one status" });
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.candidateStatus.delete({ where: { id: statusId } });
          const remaining = await tx.candidateStatus.findMany({
            where: { recruitmentCycleId: cycleId },
            orderBy: { position: "asc" }
          });
          for (let index = 0; index < remaining.length; index += 1) {
            await tx.candidateStatus.update({
              where: { id: remaining[index].id },
              data: { position: 1000 + index }
            });
          }
          for (let index = 0; index < remaining.length; index += 1) {
            await tx.candidateStatus.update({
              where: { id: remaining[index].id },
              data: { position: index }
            });
          }
          await writeAudit(tx, {
            chapterId: user.chapterId!,
            actorId: user.id,
            action: "STATUS_DELETED",
            targetType: "CandidateStatus",
            targetId: statusId,
            metadata: { cycleId, name: status.name, historyReferences: status._count.historyTo }
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2014"].includes(error.code)) {
          return reply.code(409).send({
            error: "This status is still assigned to recruitment data. Move any current PNMs to another status and try again."
          });
        }
        throw error;
      }

      return reply.code(204).send();
    }
  );

  app.put(
    "/recruitment-cycles/:cycleId/statuses/order",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = reorderStatusesSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid status order" });
      }

      const statuses = await prisma.candidateStatus.findMany({
        where: { recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } }
      });

      if (statuses.length !== parsed.data.statusIds.length) {
        return reply.code(400).send({ error: "Status order must include every status exactly once" });
      }

      const validIds = new Set(statuses.map((status) => status.id));
      if (new Set(parsed.data.statusIds).size !== statuses.length || parsed.data.statusIds.some((id) => !validIds.has(id))) {
        return reply.code(400).send({ error: "Status order contains invalid IDs" });
      }

      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < parsed.data.statusIds.length; index += 1) {
          await tx.candidateStatus.update({
            where: { id: parsed.data.statusIds[index] },
            data: { position: 1000 + index }
          });
        }
        for (let index = 0; index < parsed.data.statusIds.length; index += 1) {
          const statusId = parsed.data.statusIds[index];
          await tx.candidateStatus.update({ where: { id: statusId }, data: { position: index } });
          await tx.candidate.updateMany({ where: { statusId }, data: { statusPosition: index } });
        }
      });

      return { reordered: true };
    }
  );

  app.post(
    "/recruitment-cycles/:cycleId/fields",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = candidateFieldSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid candidate field" });
      }

      const cycle = await getOwnedCycle(user.chapterId, cycleId);
      if (!cycle) {
        return reply.code(404).send({ error: "Recruitment cycle not found" });
      }

      const maxPosition = await prisma.candidateFieldDefinition.aggregate({
        where: { recruitmentCycleId: cycleId },
        _max: { position: true }
      });

      try {
        const field = await prisma.$transaction(async (tx) => {
          const created = await tx.candidateFieldDefinition.create({
            data: {
              recruitmentCycleId: cycleId,
              key: parsed.data.key,
              label: parsed.data.label,
              type: parsed.data.type,
              required: parsed.data.required,
              visibleOnPublicForm: parsed.data.visibleOnPublicForm,
              position: (maxPosition._max.position ?? -1) + 1,
              options: parsed.data.options ?? undefined,
              validation: parsed.data.validation == null ? undefined : (parsed.data.validation as Prisma.InputJsonValue)
            }
          });
          await writeAudit(tx, {
            chapterId: user.chapterId!,
            actorId: user.id,
            action: "FIELD_CREATED",
            targetType: "CandidateFieldDefinition",
            targetId: created.id,
            metadata: { cycleId, key: created.key }
          });
          return created;
        });
        return reply.code(201).send(field);
      } catch {
        return reply.code(409).send({ error: "A field with that key already exists" });
      }
    }
  );

  app.patch(
    "/recruitment-cycles/:cycleId/fields/:fieldId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = updateCandidateFieldSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId, fieldId } = request.params as { cycleId: string; fieldId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid candidate field update" });
      }

      const field = await prisma.candidateFieldDefinition.findFirst({
        where: { id: fieldId, recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } },
        include: { _count: { select: { values: true } } }
      });

      if (!field) {
        return reply.code(404).send({ error: "Candidate field not found" });
      }

      if (parsed.data.type && parsed.data.type !== field.type && field._count.values > 0) {
        return reply.code(409).send({ error: "A field type cannot be changed after values have been collected" });
      }

      const resultingType = parsed.data.type ?? field.type;
      const resultingOptions = parsed.data.options === undefined ? field.options : parsed.data.options;
      if (["SELECT", "MULTI_SELECT"].includes(resultingType)) {
        const choices =
          resultingOptions &&
          typeof resultingOptions === "object" &&
          "choices" in resultingOptions &&
          Array.isArray((resultingOptions as { choices?: unknown }).choices)
            ? (resultingOptions as { choices: unknown[] }).choices
            : [];

        if (choices.length === 0) {
          return reply.code(400).send({ error: "Select fields require at least one option" });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.candidateFieldDefinition.update({
          where: { id: fieldId },
          data: {
            ...parsed.data,
            options: parsed.data.options === undefined ? undefined : parsed.data.options ?? undefined,
            validation: parsed.data.validation == null ? undefined : (parsed.data.validation as Prisma.InputJsonValue)
          }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "FIELD_UPDATED",
          targetType: "CandidateFieldDefinition",
          targetId: fieldId,
          metadata: { cycleId }
        });
        return saved;
      });

      return updated;
    }
  );

  app.delete(
    "/recruitment-cycles/:cycleId/fields/:fieldId",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { cycleId, fieldId } = request.params as { cycleId: string; fieldId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const field = await prisma.candidateFieldDefinition.findFirst({
        where: { id: fieldId, recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } }
      });

      if (!field) {
        return reply.code(404).send({ error: "Candidate field not found" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.candidateFieldDefinition.delete({ where: { id: fieldId } });
        const remaining = await tx.candidateFieldDefinition.findMany({
          where: { recruitmentCycleId: cycleId },
          orderBy: { position: "asc" }
        });
        for (let index = 0; index < remaining.length; index += 1) {
          await tx.candidateFieldDefinition.update({ where: { id: remaining[index].id }, data: { position: 1000 + index } });
        }
        for (let index = 0; index < remaining.length; index += 1) {
          await tx.candidateFieldDefinition.update({ where: { id: remaining[index].id }, data: { position: index } });
        }
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "FIELD_DELETED",
          targetType: "CandidateFieldDefinition",
          targetId: fieldId,
          metadata: { cycleId, key: field.key }
        });
      });

      return reply.code(204).send();
    }
  );

  app.put(
    "/recruitment-cycles/:cycleId/fields/order",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = reorderFieldsSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid field order" });
      }

      const fields = await prisma.candidateFieldDefinition.findMany({
        where: { recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } }
      });

      if (fields.length !== parsed.data.fieldIds.length) {
        return reply.code(400).send({ error: "Field order must include every custom field exactly once" });
      }

      const validIds = new Set(fields.map((field) => field.id));
      if (new Set(parsed.data.fieldIds).size !== fields.length || parsed.data.fieldIds.some((id) => !validIds.has(id))) {
        return reply.code(400).send({ error: "Field order contains invalid IDs" });
      }

      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < parsed.data.fieldIds.length; index += 1) {
          await tx.candidateFieldDefinition.update({ where: { id: parsed.data.fieldIds[index] }, data: { position: 1000 + index } });
        }
        for (let index = 0; index < parsed.data.fieldIds.length; index += 1) {
          await tx.candidateFieldDefinition.update({ where: { id: parsed.data.fieldIds[index] }, data: { position: index } });
        }
      });

      return { reordered: true };
    }
  );

  app.get(
    "/recruitment-cycles/:cycleId/form",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      const form = await prisma.publicRecruitmentForm.findFirst({
        where: { recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } },
        include: {
          recruitmentCycle: {
            include: { fieldDefinitions: { orderBy: { position: "asc" } } }
          }
        }
      });

      if (!form) {
        return reply.code(404).send({ error: "Recruitment form not found" });
      }

      return form;
    }
  );

  app.patch(
    "/recruitment-cycles/:cycleId/form",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = publicFormSettingsSchema.safeParse(request.body);
      const user = request.authUser;
      const { cycleId } = request.params as { cycleId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid recruitment form settings" });
      }

      const form = await prisma.publicRecruitmentForm.findFirst({
        where: { recruitmentCycleId: cycleId, recruitmentCycle: { chapterId: user.chapterId } }
      });

      if (!form) {
        return reply.code(404).send({ error: "Recruitment form not found" });
      }

      if (parsed.data.isOpen) {
        const cycle = await getOwnedCycle(user.chapterId, cycleId);
        if (cycle?.status !== "ACTIVE") {
          return reply.code(409).send({ error: "Only the active recruitment cycle can accept public submissions" });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.publicRecruitmentForm.update({
          where: { id: form.id },
          data: parsed.data
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "FORM_UPDATED",
          targetType: "PublicRecruitmentForm",
          targetId: form.id,
          metadata: { cycleId, isOpen: saved.isOpen }
        });
        return saved;
      });

      return updated;
    }
  );
}
