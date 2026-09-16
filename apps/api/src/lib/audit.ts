import { AuditAction, Prisma, PrismaClient } from "@biddly/db";

export type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  client: AuditClient,
  input: {
    chapterId: string;
    actorId: string;
    action: AuditAction;
    targetType: string;
    targetId: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return client.auditLog.create({
    data: {
      chapterId: input.chapterId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata
    }
  });
}
