import { exportCandidatesQuerySchema, importCandidatesSchema } from "@biddly/contracts";
import { Prisma, prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { writeAudit } from "../lib/audit.js";
import { validateCustomFieldValues } from "../lib/custom-fields.js";
import { normalizePhone } from "../lib/phone.js";
import { requireChapterRole } from "../lib/permissions.js";

function splitFullName(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length < 2) {
    return null;
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === "";
}

export async function dataRoutes(app: FastifyInstance) {
  app.post(
    "/chapter/imports/candidates",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = importCandidatesSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid CSV import request" });
      }

      const chapter = await prisma.chapter.findUnique({
        where: { id: user.chapterId },
        include: {
          activeRecruitmentCycle: {
            include: {
              statuses: { orderBy: { position: "asc" } },
              fieldDefinitions: true
            }
          }
        }
      });

      const cycle = chapter?.activeRecruitmentCycle;
      if (!cycle || cycle.status !== "ACTIVE" || cycle.statuses.length === 0) {
        return reply.code(409).send({ error: "Chapter has no active recruitment cycle" });
      }

      let rows: Record<string, string>[];
      try {
        rows = parse(parsed.data.csv, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true
        }) as Record<string, string>[];
      } catch {
        return reply.code(400).send({ error: "CSV could not be parsed" });
      }

      if (rows.length === 0) {
        return reply.code(400).send({ error: "CSV contains no candidate rows" });
      }

      if (rows.length > 5000) {
        return reply.code(400).send({ error: "A single import is limited to 5,000 candidates" });
      }

      const statusesByName = new Map(cycle.statuses.map((status) => [status.name.toLowerCase(), status]));
      const firstStatus = cycle.statuses[0];
      const prepared: Array<{
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        statusId: string;
        statusPosition: number;
        customFields: Record<string, unknown>;
      }> = [];
      const errors: Array<{ row: number; error: string }> = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const mapped: Record<string, string> = {};
        const customFields: Record<string, unknown> = {};

        for (const [sourceColumn, targetField] of Object.entries(parsed.data.mapping)) {
          const raw = row[sourceColumn];
          if (isEmpty(raw)) {
            continue;
          }
          if (targetField.startsWith("custom:")) {
            customFields[targetField.slice(7)] = raw;
          } else {
            mapped[targetField] = raw;
          }
        }

        let firstName = mapped.firstName?.trim();
        let lastName = mapped.lastName?.trim();

        if ((!firstName || !lastName) && mapped.fullName) {
          const split = splitFullName(mapped.fullName);
          firstName = split?.firstName;
          lastName = split?.lastName;
        }

        if (!firstName || !lastName) {
          errors.push({ row: index + 2, error: "First and last name are required" });
          continue;
        }

        const coercedCustomFields: Record<string, unknown> = {};
        for (const definition of cycle.fieldDefinitions) {
          const raw = customFields[definition.key];
          if (raw === undefined) continue;

          if (definition.type === "NUMBER" || definition.type === "YEAR") {
            const numberValue = Number(raw);
            coercedCustomFields[definition.key] = Number.isFinite(numberValue) ? numberValue : raw;
          } else if (definition.type === "BOOLEAN") {
            const normalized = String(raw).toLowerCase();
            coercedCustomFields[definition.key] = ["true", "yes", "1"].includes(normalized)
              ? true
              : ["false", "no", "0"].includes(normalized)
                ? false
                : raw;
          } else if (definition.type === "MULTI_SELECT") {
            coercedCustomFields[definition.key] = String(raw)
              .split(/[;,]/)
              .map((item) => item.trim())
              .filter(Boolean);
          } else {
            coercedCustomFields[definition.key] = raw;
          }
        }

        const validation = validateCustomFieldValues(cycle.fieldDefinitions, coercedCustomFields, false, true);
        if (!validation.ok) {
          errors.push({ row: index + 2, error: validation.error });
          continue;
        }

        const status = mapped.status ? statusesByName.get(mapped.status.toLowerCase()) : firstStatus;
        if (!status) {
          errors.push({ row: index + 2, error: `Unknown status: ${mapped.status}` });
          continue;
        }

        prepared.push({
          firstName,
          lastName,
          email: mapped.email?.trim().toLowerCase() || null,
          phone: normalizePhone(mapped.phone),
          statusId: status.id,
          statusPosition: status.position,
          customFields: coercedCustomFields
        });
      }

      if (errors.length > 0) {
        return reply.code(400).send({ error: "Import validation failed", rows: errors.slice(0, 100), errorCount: errors.length });
      }

      const fieldsByKey = new Map(cycle.fieldDefinitions.map((field) => [field.key, field]));

      const imported = await prisma.$transaction(async (tx) => {
        let count = 0;
        for (const row of prepared) {
          const candidate = await tx.candidate.create({
            data: {
              chapterId: user.chapterId!,
              recruitmentCycleId: cycle.id,
              statusId: row.statusId,
              statusPosition: row.statusPosition,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.phone,
              source: "IMPORT",
              createdById: user.id,
              aggregate: { create: {} }
            }
          });

          for (const [key, value] of Object.entries(row.customFields)) {
            const field = fieldsByKey.get(key);
            if (!field || isEmpty(value)) continue;
            await tx.candidateFieldValue.create({
              data: {
                candidateId: candidate.id,
                fieldId: field.id,
                value: value as Prisma.InputJsonValue
              }
            });
          }
          count += 1;
        }

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "IMPORT_COMPLETED",
          targetType: "RecruitmentCycle",
          targetId: cycle.id,
          metadata: { candidateCount: count }
        });

        return count;
      });

      return reply.code(201).send({ imported });
    }
  );

  app.get(
    "/chapter/exports/candidates.csv",
    { preHandler: [app.requireAuth, requireChapterRole("CHAPTER_ADMIN")] },
    async (request, reply) => {
      const parsed = exportCandidatesQuerySchema.safeParse(request.query);
      const user = request.authUser;

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid CSV export request" });
      }

      const chapter = await prisma.chapter.findUnique({
        where: { id: user.chapterId },
        include: {
          activeRecruitmentCycle: {
            include: { fieldDefinitions: { orderBy: { position: "asc" } } }
          }
        }
      });

      const cycle = chapter?.activeRecruitmentCycle;
      if (!cycle) {
        return reply.code(409).send({ error: "Chapter has no active recruitment cycle" });
      }

      const candidates = await prisma.candidate.findMany({
        where: {
          chapterId: user.chapterId,
          recruitmentCycleId: cycle.id,
          ...(parsed.data.includeArchived ? {} : { archivedAt: null }),
          ...(parsed.data.statusId ? { statusId: parsed.data.statusId } : {})
        },
        orderBy: [{ statusPosition: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
        include: {
          status: true,
          aggregate: true,
          customValues: true
        }
      });

      const fields = cycle.fieldDefinitions;
      const columns = [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Status",
        "Average Score",
        "Evaluation Count",
        "Source",
        "Created At",
        ...fields.map((field) => field.label)
      ];

      const records = candidates.map((candidate) => {
        const values = new Map(candidate.customValues.map((value) => [value.fieldId, value.value]));
        return [
          candidate.firstName,
          candidate.lastName,
          candidate.email ?? "",
          candidate.phone ?? "",
          candidate.status.name,
          candidate.aggregate?.averageScore ?? "",
          candidate.aggregate?.evaluationCount ?? 0,
          candidate.source,
          candidate.createdAt.toISOString(),
          ...fields.map((field) => {
            const value = values.get(field.id);
            return Array.isArray(value) ? value.join("; ") : value ?? "";
          })
        ];
      });

      const csv = stringify([columns, ...records]);
      const safeName = cycle.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

      await writeAudit(prisma, {
        chapterId: user.chapterId,
        actorId: user.id,
        action: "EXPORT_CREATED",
        targetType: "RecruitmentCycle",
        targetId: cycle.id,
        metadata: { candidateCount: candidates.length }
      });

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="biddly-${safeName}-candidates.csv"`);
      return reply.send(csv);
    }
  );
}
