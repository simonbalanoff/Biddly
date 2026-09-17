import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("organization, university, and chapter suspension block workspace operations while context remains readable", { skip: !testDatabaseUrl }, async () => {
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
  const email = `suspension-${suffix}@example.com`;
  const password = "TestingPassword123!";
  const app = await buildApp();
  let userId = "";
  let chapterId = "";
  let organizationId = "";
  let universityId = "";

  try {
    const organization = await prisma.organization.create({ data: { name: `Test Organization ${suffix}`, slug: `test-org-${suffix}` } });
    organizationId = organization.id;
    const university = await prisma.university.create({ data: { name: `Test University ${suffix}` } });
    universityId = university.id;
    const user = await prisma.user.create({
      data: { email, firstName: "Test", lastName: "Member", passwordHash: await bcrypt.hash(password, 4), emailVerified: true }
    });
    userId = user.id;
    const chapter = await prisma.chapter.create({
      data: {
        organizationId,
        universityId,
        name: `Test Chapter ${suffix}`,
        slug: `test-chapter-${suffix}`,
        memberships: { create: { userId, role: "MEMBER" } },
        subscriptions: {
          create: {
            term: "SEMESTER",
            status: "ACTIVE",
            periodStart: new Date(Date.now() - 60_000),
            periodEnd: new Date(Date.now() + 86_400_000),
            provider: "stripe",
            providerSubscriptionId: `sub_suspension_${suffix}`
          }
        }
      }
    });
    chapterId = chapter.id;

    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
    assert.equal(login.statusCode, 200);
    const accessToken = login.json().accessToken as string;
    const headers = { authorization: `Bearer ${accessToken}` };

    const active = await app.inject({ method: "GET", url: "/v1/chapter", headers });
    assert.equal(active.statusCode, 200);

    await prisma.organization.update({ where: { id: organizationId }, data: { isActive: false } });
    const blockedByOrg = await app.inject({ method: "GET", url: "/v1/chapter", headers });
    assert.equal(blockedByOrg.statusCode, 403);
    assert.equal(blockedByOrg.json().code, "ORGANIZATION_SUSPENDED");
    const orgContext = await app.inject({ method: "GET", url: "/v1/me/context", headers });
    assert.equal(orgContext.statusCode, 200);
    assert.equal(orgContext.json().chapterAccess.reason, "ORGANIZATION_SUSPENDED");

    await prisma.organization.update({ where: { id: organizationId }, data: { isActive: true } });
    await prisma.university.update({ where: { id: universityId }, data: { isActive: false } });
    const blockedByUniversity = await app.inject({ method: "GET", url: "/v1/chapter", headers });
    assert.equal(blockedByUniversity.statusCode, 403);
    assert.equal(blockedByUniversity.json().code, "UNIVERSITY_SUSPENDED");

    await prisma.university.update({ where: { id: universityId }, data: { isActive: true } });
    await prisma.chapter.update({ where: { id: chapterId }, data: { isActive: false } });
    const blockedByChapter = await app.inject({ method: "GET", url: "/v1/chapter", headers });
    assert.equal(blockedByChapter.statusCode, 403);
    assert.equal(blockedByChapter.json().code, "CHAPTER_SUSPENDED");
  } finally {
    if (chapterId) await prisma.chapter.deleteMany({ where: { id: chapterId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (universityId) await prisma.university.deleteMany({ where: { id: universityId } });
    await app.close();
    await prisma.$disconnect();
  }
});
