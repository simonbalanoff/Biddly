import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("chapter role boundaries preserve member rating/comment access while restricting management", { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET ||= "biddly-test-jwt-secret-at-least-thirty-two-characters";
  process.env.APP_ORIGIN ||= "http://localhost:3000";
  process.env.APP_BASE_URL ||= "http://localhost:3000";

  const [{ buildApp }, { prisma }, bcrypt] = await Promise.all([
    import("../src/app.js"),
    import("@biddly/db"),
    import("bcryptjs")
  ]);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "TestingPassword123!";
  const app = await buildApp();
  let organizationId = "";
  let universityId = "";
  let chapterId = "";
  const userIds: string[] = [];

  try {
    const organization = await prisma.organization.create({ data: { name: `Permissions Organization ${suffix}`, slug: `permissions-org-${suffix}` } });
    organizationId = organization.id;
    const university = await prisma.university.create({ data: { name: `Permissions University ${suffix}` } });
    universityId = university.id;
    const passwordHash = await bcrypt.hash(password, 4);
    const member = await prisma.user.create({ data: { email: `member-${suffix}@example.com`, firstName: "Member", lastName: "Tester", passwordHash, emailVerified: true } });
    const moderator = await prisma.user.create({ data: { email: `moderator-${suffix}@example.com`, firstName: "Moderator", lastName: "Tester", passwordHash, emailVerified: true } });
    userIds.push(member.id, moderator.id);

    const chapter = await prisma.chapter.create({
      data: {
        organizationId,
        universityId,
        name: `Permissions Chapter ${suffix}`,
        slug: `permissions-chapter-${suffix}`,
        settings: { create: {} },
        memberships: { create: [{ userId: member.id, role: "MEMBER" }, { userId: moderator.id, role: "MODERATOR" }] },
        subscriptions: {
          create: {
            term: "SEMESTER",
            status: "ACTIVE",
            periodStart: new Date(Date.now() - 60_000),
            periodEnd: new Date(Date.now() + 86_400_000),
            provider: "stripe",
            providerSubscriptionId: `sub_permissions_${suffix}`
          }
        }
      }
    });
    chapterId = chapter.id;

    const cycle = await prisma.recruitmentCycle.create({
      data: { chapterId, name: `Fall ${suffix}`, status: "ACTIVE", createdById: moderator.id }
    });
    await prisma.chapter.update({ where: { id: chapterId }, data: { activeRecruitmentCycleId: cycle.id } });
    const status = await prisma.candidateStatus.create({ data: { recruitmentCycleId: cycle.id, name: "New", position: 0 } });
    const candidate = await prisma.candidate.create({
      data: {
        chapterId,
        recruitmentCycleId: cycle.id,
        firstName: "Existing",
        lastName: "Candidate",
        statusId: status.id,
        statusPosition: 0,
        createdById: moderator.id,
        source: "MANUAL",
        aggregate: { create: {} }
      }
    });

    const memberLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: member.email, password } });
    assert.equal(memberLogin.statusCode, 200);
    const memberHeaders = { authorization: `Bearer ${memberLogin.json().accessToken as string}` };

    const memberCreate = await app.inject({ method: "POST", url: "/v1/candidates", headers: memberHeaders, payload: { firstName: "Blocked", lastName: "Create", customFields: {} } });
    assert.equal(memberCreate.statusCode, 403);

    const evaluation = await app.inject({ method: "POST", url: `/v1/candidates/${candidate.id}/evaluations`, headers: memberHeaders, payload: { score: 7 } });
    assert.equal(evaluation.statusCode, 200);

    const comment = await app.inject({ method: "POST", url: `/v1/candidates/${candidate.id}/comments`, headers: memberHeaders, payload: { body: "Member feedback" } });
    assert.equal(comment.statusCode, 201);

    const moderatorLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: moderator.email, password } });
    assert.equal(moderatorLogin.statusCode, 200);
    const moderatorHeaders = { authorization: `Bearer ${moderatorLogin.json().accessToken as string}` };
    const moderatorCreate = await app.inject({ method: "POST", url: "/v1/candidates", headers: moderatorHeaders, payload: { firstName: "Allowed", lastName: "Create", customFields: {} } });
    assert.equal(moderatorCreate.statusCode, 201);
  } finally {
    if (chapterId) await prisma.chapter.deleteMany({ where: { id: chapterId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (universityId) await prisma.university.deleteMany({ where: { id: universityId } });
    await app.close();
    await prisma.$disconnect();
  }
});
