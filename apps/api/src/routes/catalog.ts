import { prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/catalog/organizations", async (request) => {
    const { q = "" } = request.query as { q?: string };
    return prisma.organization.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { shortName: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" },
      take: 100,
      select: {
        id: true,
        name: true,
        shortName: true,
        slug: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        crestUrl: true
      }
    });
  });

  app.get("/catalog/universities", async (request) => {
    const { q = "" } = request.query as { q?: string };
    return prisma.university.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { shortName: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { state: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" },
      take: 100,
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        state: true,
        country: true
      }
    });
  });
}
