import { createWorkspaceInviteSchema, organizationSchema, universitySchema } from "@biddly/contracts";
import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { env } from "../lib/env.js";
import { requirePlatformAdmin } from "../lib/permissions.js";
import { slugify } from "../lib/slug.js";
import { createOpaqueToken, hashToken } from "../lib/tokens.js";

export async function platformRoutes(app: FastifyInstance) {
  app.post(
    "/platform/workspace-invites",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = createWorkspaceInviteSchema.safeParse(request.body);
      const user = request.authUser;

      if (!parsed.success || !user) {
        return reply.code(400).send({ error: "Invalid workspace invite" });
      }

      if (parsed.data.organizationId) {
        const organization = await prisma.organization.findFirst({
          where: { id: parsed.data.organizationId, isActive: true },
          select: { id: true }
        });

        if (!organization) {
          return reply.code(404).send({ error: "Organization not found" });
        }
      }

      if (parsed.data.universityId) {
        const university = await prisma.university.findFirst({
          where: { id: parsed.data.universityId, isActive: true },
          select: { id: true }
        });

        if (!university) {
          return reply.code(404).send({ error: "University not found" });
        }
      }

      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

      const invite = await prisma.workspaceInvite.create({
        data: {
          email: parsed.data.email,
          tokenHash: hashToken(token),
          organizationId: parsed.data.organizationId ?? null,
          universityId: parsed.data.universityId ?? null,
          chapterName: parsed.data.chapterName ?? null,
          createdById: user.id,
          expiresAt
        }
      });

      return reply.code(201).send({
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        inviteUrl: `${env.APP_BASE_URL}/setup?token=${encodeURIComponent(token)}`
      });
    }
  );

  app.get(
    "/platform/workspace-invites",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async () => {
      return prisma.workspaceInvite.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          organization: { select: { id: true, name: true, shortName: true } },
          university: { select: { id: true, name: true, shortName: true } }
        }
      });
    }
  );

  app.delete(
    "/platform/workspace-invites/:inviteId",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const { inviteId } = request.params as { inviteId: string };

      const invite = await prisma.workspaceInvite.findUnique({
        where: { id: inviteId },
        select: { id: true, acceptedAt: true }
      });

      if (!invite) {
        return reply.code(404).send({ error: "Workspace invitation not found" });
      }

      if (invite.acceptedAt) {
        return reply.code(409).send({ error: "Accepted workspace invitations are kept as onboarding history" });
      }

      await prisma.workspaceInvite.delete({ where: { id: invite.id } });
      return reply.code(204).send();
    }
  );

  app.post(
    "/platform/organizations",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = organizationSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid organization" });
      }

      const slug = slugify(parsed.data.name);

      try {
        const organization = await prisma.organization.create({
          data: {
            name: parsed.data.name,
            shortName: parsed.data.shortName ?? null,
            slug,
            primaryColor: parsed.data.primaryColor ?? null,
            secondaryColor: parsed.data.secondaryColor ?? null,
            accentColor: parsed.data.accentColor ?? null,
            logoUrl: parsed.data.logoUrl ?? null,
            crestUrl: parsed.data.crestUrl ?? null
          }
        });
        return reply.code(201).send(organization);
      } catch {
        return reply.code(409).send({ error: "An organization with that name already exists" });
      }
    }
  );

  app.post(
    "/platform/universities",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async (request, reply) => {
      const parsed = universitySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid university" });
      }

      try {
        const university = await prisma.university.create({
          data: {
            name: parsed.data.name,
            shortName: parsed.data.shortName ?? null,
            city: parsed.data.city ?? null,
            state: parsed.data.state ?? null,
            country: parsed.data.country
          }
        });
        return reply.code(201).send(university);
      } catch {
        return reply.code(409).send({ error: "A university with that name already exists" });
      }
    }
  );

  app.get(
    "/platform/chapters",
    { preHandler: [app.requireAuth, requirePlatformAdmin] },
    async () => {
      return prisma.chapter.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          organization: { select: { id: true, name: true, shortName: true } },
          university: { select: { id: true, name: true, shortName: true } },
          activeRecruitmentCycle: true,
          _count: { select: { memberships: true, candidates: true } }
        }
      });
    }
  );
}
