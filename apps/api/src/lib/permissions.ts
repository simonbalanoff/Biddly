import { FastifyReply, FastifyRequest } from "fastify";

const rank = {
  MEMBER: 1,
  MODERATOR: 2,
  CHAPTER_ADMIN: 3
} as const;

export function requireChapterRole(minimum: keyof typeof rank) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = request.authUser;

    if (!user?.chapterId || !user.chapterRole) {
      return reply.code(403).send({ error: "Chapter access required" });
    }

    if (rank[user.chapterRole] < rank[minimum]) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.authUser?.platformRole !== "PLATFORM_ADMIN") {
    return reply.code(403).send({ error: "Platform administrator access required" });
  }
}
