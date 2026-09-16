import {
  createCommentSchema,
  moderateCommentSchema,
  reactionSchema,
  reportCommentSchema,
  resolveReportSchema,
  updateCommentSchema
} from "@biddly/contracts";
import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { requireChapterRole } from "../lib/permissions.js";

function canModerate(role: string | null | undefined) {
  return role === "MODERATOR" || role === "CHAPTER_ADMIN";
}

function serializeComment<T extends { state: string; body: string }>(comment: T, moderator: boolean) {
  if (comment.state === "VISIBLE" || moderator) {
    return comment;
  }

  return {
    ...comment,
    body: comment.state === "HIDDEN" ? "This comment has been hidden by a moderator." : "This comment has been removed."
  };
}

export async function discussionRoutes(app: FastifyInstance) {
  app.get("/candidates/:candidateId/comments", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;
    const { candidateId } = request.params as { candidateId: string };

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const settings = await prisma.chapterSettings.findUnique({ where: { chapterId: user.chapterId } });
    if (settings && !settings.commentsEnabled && !canModerate(user.chapterRole)) {
      return reply.code(403).send({ error: "Comments are disabled for this chapter" });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, chapterId: user.chapterId },
      select: { id: true }
    });

    if (!candidate) {
      return reply.code(404).send({ error: "Candidate not found" });
    }

    const comments = await prisma.comment.findMany({
      where: { candidateId, chapterId: user.chapterId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        moderatedBy: { select: { id: true, firstName: true, lastName: true } },
        reactions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const authorIds = Array.from(new Set(comments.map((comment) => comment.userId)));
    const evaluations = authorIds.length
      ? await prisma.evaluation.findMany({
          where: {
            candidateId,
            userId: { in: authorIds }
          },
          select: {
            userId: true,
            score: true
          }
        })
      : [];
    const scoresByUserId = new Map(evaluations.map((evaluation) => [evaluation.userId, evaluation.score]));

    const moderator = canModerate(user.chapterRole);
    const serialized = comments.map((comment) => ({
      ...serializeComment(comment, moderator),
      authorScore: scoresByUserId.get(comment.userId) ?? null,
      replies: [] as any[]
    }));
    const byId = new Map(serialized.map((comment) => [comment.id, comment]));
    const roots: typeof serialized = [];

    for (const comment of serialized) {
      if (comment.parentId) {
        const parent = byId.get(comment.parentId);
        if (parent) {
          parent.replies.push(comment);
          continue;
        }
      }
      roots.push(comment);
    }

    return roots;
  });

  app.post("/candidates/:candidateId/comments", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = createCommentSchema.safeParse(request.body);
    const user = request.authUser;
    const { candidateId } = request.params as { candidateId: string };

    if (!parsed.success || !user?.chapterId) {
      return reply.code(400).send({ error: "Invalid comment" });
    }

    const [settings, candidate] = await Promise.all([
      prisma.chapterSettings.findUnique({ where: { chapterId: user.chapterId } }),
      prisma.candidate.findFirst({
        where: { id: candidateId, chapterId: user.chapterId, archivedAt: null },
        select: { id: true, recruitmentCycleId: true }
      })
    ]);

    if (!candidate) {
      return reply.code(404).send({ error: "Candidate not found" });
    }

    if (settings && !settings.commentsEnabled) {
      return reply.code(403).send({ error: "Comments are disabled for this chapter" });
    }

    if (parsed.data.parentId && settings && !settings.repliesEnabled) {
      return reply.code(403).send({ error: "Replies are disabled for this chapter" });
    }

    if (parsed.data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: {
          id: parsed.data.parentId,
          chapterId: user.chapterId,
          candidateId,
          state: "VISIBLE"
        },
        select: { id: true }
      });

      if (!parent) {
        return reply.code(404).send({ error: "Parent comment not found" });
      }
    }

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          chapterId: user.chapterId!,
          recruitmentCycleId: candidate.recruitmentCycleId,
          candidateId,
          userId: user.id,
          parentId: parsed.data.parentId ?? null,
          body: parsed.data.body
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } }
        }
      });

      await writeAudit(tx, {
        chapterId: user.chapterId!,
        actorId: user.id,
        action: "COMMENT_CREATED",
        targetType: "Comment",
        targetId: created.id,
        metadata: { candidateId, parentId: created.parentId }
      });

      return created;
    });

    return reply.code(201).send(comment);
  });

  app.patch("/comments/:commentId", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = updateCommentSchema.safeParse(request.body);
    const user = request.authUser;
    const { commentId } = request.params as { commentId: string };

    if (!parsed.success || !user?.chapterId) {
      return reply.code(400).send({ error: "Invalid comment update" });
    }

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, chapterId: user.chapterId }
    });

    if (!comment) {
      return reply.code(404).send({ error: "Comment not found" });
    }

    if (comment.userId !== user.id || comment.state !== "VISIBLE") {
      return reply.code(403).send({ error: "You cannot edit this comment" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.comment.update({ where: { id: commentId }, data: { body: parsed.data.body } });
      await writeAudit(tx, {
        chapterId: user.chapterId!,
        actorId: user.id,
        action: "COMMENT_UPDATED",
        targetType: "Comment",
        targetId: commentId
      });
      return saved;
    });

    return updated;
  });

  app.delete("/comments/:commentId", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const user = request.authUser;
    const { commentId } = request.params as { commentId: string };

    if (!user?.chapterId) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, chapterId: user.chapterId },
      include: { _count: { select: { replies: true } } }
    });

    if (!comment) {
      return reply.code(404).send({ error: "Comment not found" });
    }

    if (comment.userId !== user.id || comment.state !== "VISIBLE") {
      return reply.code(403).send({ error: "You cannot remove this comment" });
    }

    await prisma.$transaction(async (tx) => {
      const permanentlyDeleted = comment._count.replies === 0;
      const prunedAncestorIds: string[] = [];

      if (permanentlyDeleted) {
        await tx.comment.delete({ where: { id: comment.id } });

        let parentId = comment.parentId;
        while (parentId) {
          const parent = await tx.comment.findUnique({
            where: { id: parentId },
            select: {
              id: true,
              parentId: true,
              state: true,
              moderationReason: true,
              _count: { select: { replies: true } }
            }
          });

          if (
            !parent ||
            parent.state !== "REMOVED" ||
            parent.moderationReason !== "Removed by author" ||
            parent._count.replies > 0
          ) {
            break;
          }

          const nextParentId = parent.parentId;
          await tx.comment.delete({ where: { id: parent.id } });
          prunedAncestorIds.push(parent.id);
          parentId = nextParentId;
        }
      } else {
        await tx.comment.update({
          where: { id: comment.id },
          data: {
            state: "REMOVED",
            moderatedAt: new Date(),
            moderatedById: user.id,
            moderationReason: "Removed by author"
          }
        });
      }

      await writeAudit(tx, {
        chapterId: user.chapterId!,
        actorId: user.id,
        action: "COMMENT_REMOVED",
        targetType: "Comment",
        targetId: comment.id,
        metadata: {
          removedByAuthor: true,
          permanentlyDeleted,
          prunedAncestorIds
        }
      });
    });

    return reply.code(204).send();
  });

  app.put("/comments/:commentId/reactions", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = reactionSchema.safeParse(request.body);
    const user = request.authUser;
    const { commentId } = request.params as { commentId: string };

    if (!parsed.success || !user?.chapterId) {
      return reply.code(400).send({ error: "Invalid reaction" });
    }

    const settings = await prisma.chapterSettings.findUnique({ where: { chapterId: user.chapterId } });
    if (settings && !settings.reactionsEnabled) {
      return reply.code(403).send({ error: "Reactions are disabled for this chapter" });
    }

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, chapterId: user.chapterId, state: "VISIBLE" }
    });

    if (!comment) {
      return reply.code(404).send({ error: "Comment not found" });
    }

    const reaction = await prisma.commentReaction.upsert({
      where: { commentId_userId_emoji: { commentId, userId: user.id, emoji: parsed.data.emoji } },
      create: {
        chapterId: user.chapterId,
        recruitmentCycleId: comment.recruitmentCycleId,
        commentId,
        userId: user.id,
        emoji: parsed.data.emoji
      },
      update: {}
    });

    return reaction;
  });

  app.delete("/comments/:commentId/reactions", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = reactionSchema.safeParse(request.body);
    const user = request.authUser;
    const { commentId } = request.params as { commentId: string };

    if (!parsed.success || !user?.chapterId) {
      return reply.code(400).send({ error: "Invalid reaction" });
    }

    await prisma.commentReaction.deleteMany({
      where: {
        chapterId: user.chapterId,
        commentId,
        userId: user.id,
        emoji: parsed.data.emoji
      }
    });

    return reply.code(204).send();
  });

  app.post(
    "/comments/:commentId/moderate",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const parsed = moderateCommentSchema.safeParse(request.body);
      const user = request.authUser;
      const { commentId } = request.params as { commentId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid moderation action" });
      }

      const comment = await prisma.comment.findFirst({
        where: { id: commentId, chapterId: user.chapterId }
      });

      if (!comment) {
        return reply.code(404).send({ error: "Comment not found" });
      }

      const state = parsed.data.action === "HIDE" ? "HIDDEN" : parsed.data.action === "REMOVE" ? "REMOVED" : "VISIBLE";
      const auditAction =
        parsed.data.action === "HIDE"
          ? "COMMENT_HIDDEN"
          : parsed.data.action === "REMOVE"
            ? "COMMENT_REMOVED"
            : "COMMENT_RESTORED";

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.comment.update({
          where: { id: comment.id },
          data: {
            state,
            moderatedAt: state === "VISIBLE" ? null : new Date(),
            moderatedById: state === "VISIBLE" ? null : user.id,
            moderationReason: state === "VISIBLE" ? null : parsed.data.reason ?? null
          }
        });
        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: auditAction,
          targetType: "Comment",
          targetId: comment.id,
          metadata: { reason: parsed.data.reason ?? null }
        });
        return saved;
      });

      return updated;
    }
  );

  app.post("/comments/:commentId/reports", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const parsed = reportCommentSchema.safeParse(request.body);
    const user = request.authUser;
    const { commentId } = request.params as { commentId: string };

    if (!parsed.success || !user?.chapterId) {
      return reply.code(400).send({ error: "Invalid report" });
    }

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, chapterId: user.chapterId },
      select: { id: true, recruitmentCycleId: true }
    });

    if (!comment) {
      return reply.code(404).send({ error: "Comment not found" });
    }

    const existing = await prisma.moderationReport.findFirst({
      where: { commentId, reportedById: user.id, status: "PENDING" }
    });

    if (existing) {
      return reply.code(409).send({ error: "You have already reported this comment" });
    }

    const report = await prisma.moderationReport.create({
      data: {
        chapterId: user.chapterId,
        recruitmentCycleId: comment.recruitmentCycleId,
        commentId,
        reportedById: user.id,
        reason: parsed.data.reason,
        details: parsed.data.details ?? null
      }
    });

    return reply.code(201).send(report);
  });

  app.get(
    "/chapter/moderation/reports",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const user = request.authUser;
      const { status = "PENDING" } = request.query as { status?: "PENDING" | "DISMISSED" | "ACTIONED" };

      if (!user?.chapterId) {
        return reply.code(403).send({ error: "Chapter access required" });
      }

      return prisma.moderationReport.findMany({
        where: { chapterId: user.chapterId, status },
        orderBy: { createdAt: "desc" },
        include: {
          comment: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
              candidate: { select: { id: true, firstName: true, lastName: true } }
            }
          },
          reportedBy: { select: { id: true, firstName: true, lastName: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } }
        }
      });
    }
  );

  app.post(
    "/chapter/moderation/reports/:reportId/resolve",
    { preHandler: [app.requireAuth, requireChapterRole("MODERATOR")] },
    async (request, reply) => {
      const parsed = resolveReportSchema.safeParse(request.body);
      const user = request.authUser;
      const { reportId } = request.params as { reportId: string };

      if (!parsed.success || !user?.chapterId) {
        return reply.code(400).send({ error: "Invalid report resolution" });
      }

      if (parsed.data.resolution === "ACTION" && !parsed.data.action) {
        return reply.code(400).send({ error: "An action is required when resolving with action" });
      }

      const report = await prisma.moderationReport.findFirst({
        where: { id: reportId, chapterId: user.chapterId, status: "PENDING" },
        include: { comment: true }
      });

      if (!report) {
        return reply.code(404).send({ error: "Pending report not found" });
      }

      const result = await prisma.$transaction(async (tx) => {
        if (parsed.data.resolution === "ACTION") {
          await tx.comment.update({
            where: { id: report.commentId },
            data: {
              state: parsed.data.action === "REMOVE" ? "REMOVED" : "HIDDEN",
              moderatedAt: new Date(),
              moderatedById: user.id,
              moderationReason: parsed.data.note ?? `Moderation report: ${report.reason}`
            }
          });
        }

        const saved = await tx.moderationReport.update({
          where: { id: report.id },
          data: {
            status: parsed.data.resolution === "ACTION" ? "ACTIONED" : "DISMISSED",
            reviewedById: user.id,
            reviewedAt: new Date(),
            resolutionNote: parsed.data.note ?? null
          }
        });

        await writeAudit(tx, {
          chapterId: user.chapterId!,
          actorId: user.id,
          action: "REPORT_RESOLVED",
          targetType: "ModerationReport",
          targetId: report.id,
          metadata: {
            resolution: parsed.data.resolution,
            action: parsed.data.action ?? null
          }
        });

        return saved;
      });

      return result;
    }
  );
}
