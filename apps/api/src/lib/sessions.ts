import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { env } from "./env.js";
import { createOpaqueToken, hashToken } from "./tokens.js";

export async function issueSession(app: FastifyInstance, userId: string) {
  const accessToken = app.jwt.sign({ sub: userId }, { expiresIn: env.ACCESS_TOKEN_TTL });
  const refreshToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt
    }
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL
  };
}

export async function rotateRefreshToken(app: FastifyInstance, refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!stored || stored.revokedAt || stored.expiresAt <= new Date() || !stored.user.isActive) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });

    const nextRefreshToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashToken(nextRefreshToken),
        expiresAt
      }
    });

    return {
      accessToken: app.jwt.sign({ sub: stored.userId }, { expiresIn: env.ACCESS_TOKEN_TTL }),
      refreshToken: nextRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL
    };
  });
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
