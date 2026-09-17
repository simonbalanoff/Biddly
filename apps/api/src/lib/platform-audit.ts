import type { Prisma, PrismaClient } from "@biddly/db";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writePlatformAudit(client: AuditClient, input: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return client.platformAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata
    }
  });
}
