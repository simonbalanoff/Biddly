import { storageCleanupSchema, storageDeleteSchema } from "@biddly/contracts";
import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { writePlatformAudit } from "../lib/platform-audit.js";
import { requirePlatformAdmin } from "../lib/permissions.js";
import { deletePrivateStorageObjects, listPrivateStorageObjects, storageBucketName, storageConfigured } from "../lib/storage.js";

function storageCategory(key: string) {
  const first = key.split("/")[0];
  if (first === "candidate-photos") return "Candidate photo";
  return first ? first.replaceAll("-", " ") : "Object";
}

function chapterIdFromKey(key: string) {
  const parts = key.split("/");
  return parts[0] === "candidate-photos" && parts[1] ? parts[1] : null;
}

async function readInventory() {
  const [inventory, candidates, chapters] = await Promise.all([
    listPrivateStorageObjects(),
    prisma.candidate.findMany({
      where: { photoKey: { not: null } },
      select: { photoKey: true, chapterId: true, recruitmentCycleId: true }
    }),
    prisma.chapter.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        storageQuotaBytes: true,
        organization: { select: { id: true, name: true, shortName: true, isActive: true } },
        university: { select: { id: true, name: true, shortName: true, isActive: true } }
      }
    })
  ]);

  if (!inventory) return null;

  const references = new Map<string, { photoKey: string; chapterId: string; recruitmentCycleId: string }>();
  for (const candidate of candidates) {
    if (!candidate.photoKey) continue;
    references.set(candidate.photoKey, {
      photoKey: candidate.photoKey,
      chapterId: candidate.chapterId,
      recruitmentCycleId: candidate.recruitmentCycleId
    });
  }

  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const objectKeys = new Set(inventory.objects.map((object) => object.key));
  const workspaceUsage = new Map<string, { objectCount: number; totalBytes: number; orphanedObjects: number }>();

  const objects = inventory.objects.map((object) => {
    const reference = references.get(object.key);
    const chapterId = reference?.chapterId ?? chapterIdFromKey(object.key);
    const workspace = chapterId ? chapterMap.get(chapterId) ?? null : null;
    const referenced = Boolean(reference);

    if (chapterId) {
      const usage = workspaceUsage.get(chapterId) ?? { objectCount: 0, totalBytes: 0, orphanedObjects: 0 };
      usage.objectCount += 1;
      usage.totalBytes += object.size;
      if (!referenced) usage.orphanedObjects += 1;
      workspaceUsage.set(chapterId, usage);
    }

    return {
      key: object.key,
      size: object.size,
      lastModified: object.lastModified,
      eTag: object.eTag,
      category: storageCategory(object.key),
      referenced,
      workspace: workspace
        ? {
            id: workspace.id,
            name: workspace.name,
            isActive: workspace.isActive,
            organization: workspace.organization,
            university: workspace.university
          }
        : null
    };
  });

  const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);
  const referencedObjects = objects.filter((object) => object.referenced).length;
  const missingReferences = candidates
    .filter((candidate) => candidate.photoKey && !objectKeys.has(candidate.photoKey))
    .map((candidate) => ({
      key: candidate.photoKey!,
      chapterId: candidate.chapterId,
      recruitmentCycleId: candidate.recruitmentCycleId,
      workspace: chapterMap.get(candidate.chapterId)
        ? {
            id: chapterMap.get(candidate.chapterId)!.id,
            name: chapterMap.get(candidate.chapterId)!.name,
            organization: chapterMap.get(candidate.chapterId)!.organization,
            university: chapterMap.get(candidate.chapterId)!.university
          }
        : null
    }));

  const workspaces = chapters
    .map((chapter) => {
      const usage = workspaceUsage.get(chapter.id) ?? { objectCount: 0, totalBytes: 0, orphanedObjects: 0 };
      const quotaBytes = chapter.storageQuotaBytes === null ? null : Number(chapter.storageQuotaBytes);
      return {
        id: chapter.id,
        name: chapter.name,
        organization: chapter.organization,
        university: chapter.university,
        ...usage,
        quotaBytes,
        quotaPercent: quotaBytes && quotaBytes > 0 ? Math.round((usage.totalBytes / quotaBytes) * 1000) / 10 : null,
        quotaExceeded: Boolean(quotaBytes && usage.totalBytes > quotaBytes)
      };
    })
    .filter((workspace) => workspace.objectCount > 0 || workspace.quotaBytes !== null)
    .sort((a, b) => b.totalBytes - a.totalBytes);

  return {
    bucket: inventory.bucket,
    truncated: inventory.truncated,
    summary: {
      totalObjects: objects.length,
      totalBytes,
      referencedObjects,
      orphanedObjects: objects.length - referencedObjects,
      missingReferences: missingReferences.length
    },
    workspaces,
    objects,
    missingReferenceDetails: missingReferences
  };
}

export async function platformStorageRoutes(app: FastifyInstance) {
  app.get(
    "/platform/storage",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (_request, reply) => {
      if (!storageConfigured()) {
        return {
          configured: false,
          bucket: storageBucketName(),
          truncated: false,
          summary: { totalObjects: 0, totalBytes: 0, referencedObjects: 0, orphanedObjects: 0, missingReferences: 0 },
          workspaces: [],
          objects: [],
          missingReferenceDetails: []
        };
      }

      try {
        const result = await readInventory();
        if (!result) return reply.code(503).send({ error: "Object storage is not configured" });
        return { configured: true, ...result };
      } catch (error) {
        app.log.error(error);
        return reply.code(502).send({ error: "Unable to list object storage. Verify the R2 API token can read and list this bucket." });
      }
    }
  );

  app.post(
    "/platform/storage/delete",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = storageDeleteSchema.safeParse(request.body);
      const user = request.authUser;
      if (!parsed.success || !user) return reply.code(400).send({ error: "Invalid storage deletion request" });

      const references = await prisma.candidate.findMany({
        where: { photoKey: { in: parsed.data.keys } },
        select: { photoKey: true }
      });
      const referenced = new Set(references.flatMap((item) => item.photoKey ? [item.photoKey] : []));
      const safeKeys = parsed.data.keys.filter((key) => !referenced.has(key));
      const skippedReferenced = parsed.data.keys.filter((key) => referenced.has(key));

      if (!safeKeys.length) {
        return reply.code(409).send({ error: "Every selected object is still referenced by Biddly", skippedReferenced });
      }

      const result = await deletePrivateStorageObjects(safeKeys);
      if (!result) return reply.code(503).send({ error: "Object storage is not configured" });

      await writePlatformAudit(prisma, {
        actorId: user.id,
        action: "STORAGE_OBJECTS_DELETED",
        targetType: "Storage",
        metadata: {
          requested: parsed.data.keys.length,
          deleted: result.deleted,
          skippedReferenced,
          errors: result.errors
        }
      });

      return { deleted: result.deleted, skippedReferenced, errors: result.errors };
    }
  );

  app.post(
    "/platform/storage/cleanup",
    { preHandler: [app.requireAuth, requirePlatformAdmin], config: { rateLimit: { max: 3, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const parsed = storageCleanupSchema.safeParse(request.body);
      const user = request.authUser;
      if (!parsed.success || !user) return reply.code(400).send({ error: "Invalid storage cleanup request" });

      const inventory = await readInventory();
      if (!inventory) return reply.code(503).send({ error: "Object storage is not configured" });

      const cutoff = Date.now() - parsed.data.olderThanDays * 24 * 60 * 60 * 1000;
      const keys = inventory.objects
        .filter((object) => !object.referenced)
        .filter((object) => !parsed.data.workspaceId || object.workspace?.id === parsed.data.workspaceId)
        .filter((object) => !object.lastModified || new Date(object.lastModified).getTime() <= cutoff)
        .map((object) => object.key);

      if (!keys.length) return { deleted: [], errors: [], matched: 0 };

      const result = await deletePrivateStorageObjects(keys);
      if (!result) return reply.code(503).send({ error: "Object storage is not configured" });

      await writePlatformAudit(prisma, {
        actorId: user.id,
        action: "STORAGE_ORPHAN_CLEANUP",
        targetType: "Storage",
        targetId: parsed.data.workspaceId ?? null,
        metadata: {
          matched: keys.length,
          deleted: result.deleted.length,
          olderThanDays: parsed.data.olderThanDays,
          errors: result.errors
        }
      });

      return { deleted: result.deleted, errors: result.errors, matched: keys.length };
    }
  );

  app.get(
    "/platform/storage/activity",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async () => {
      return prisma.platformAuditLog.findMany({
        where: { action: { startsWith: "STORAGE_" } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } }
      });
    }
  );
}
