import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("inactive subscriptions leave chapter admins read-only and fully lock members", { skip: !testDatabaseUrl }, async () => {
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
    const organization = await prisma.organization.create({ data: { name: `Subscription Organization ${suffix}`, slug: `subscription-org-${suffix}` } });
    organizationId = organization.id;
    const university = await prisma.university.create({ data: { name: `Subscription University ${suffix}` } });
    universityId = university.id;
    const passwordHash = await bcrypt.hash(password, 4);
    const admin = await prisma.user.create({ data: { email: `admin-${suffix}@example.com`, firstName: "Admin", lastName: "Tester", passwordHash, emailVerified: true } });
    const member = await prisma.user.create({ data: { email: `member-sub-${suffix}@example.com`, firstName: "Member", lastName: "Tester", passwordHash, emailVerified: true } });
    userIds.push(admin.id, member.id);

    const chapter = await prisma.chapter.create({
      data: {
        organizationId,
        universityId,
        name: `Subscription Chapter ${suffix}`,
        slug: `subscription-chapter-${suffix}`,
        settings: { create: {} },
        memberships: { create: [{ userId: admin.id, role: "CHAPTER_ADMIN" }, { userId: member.id, role: "MEMBER" }] }
      }
    });
    chapterId = chapter.id;

    const adminLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: admin.email, password } });
    assert.equal(adminLogin.statusCode, 200);
    const adminHeaders = { authorization: `Bearer ${adminLogin.json().accessToken as string}` };

    const adminContext = await app.inject({ method: "GET", url: "/v1/me/context", headers: adminHeaders });
    assert.equal(adminContext.statusCode, 200);
    assert.equal(adminContext.json().subscriptionAccess.mode, "READ_ONLY");

    const adminRead = await app.inject({ method: "GET", url: "/v1/chapter", headers: adminHeaders });
    assert.equal(adminRead.statusCode, 200);

    const adminWrite = await app.inject({ method: "PATCH", url: "/v1/chapter", headers: adminHeaders, payload: { name: `Changed ${suffix}` } });
    assert.equal(adminWrite.statusCode, 402);
    assert.equal(adminWrite.json().code, "SUBSCRIPTION_READ_ONLY");

    const billing = await app.inject({ method: "GET", url: "/v1/chapter/billing", headers: adminHeaders });
    assert.equal(billing.statusCode, 200);

    const memberLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: member.email, password } });
    assert.equal(memberLogin.statusCode, 200);
    const memberHeaders = { authorization: `Bearer ${memberLogin.json().accessToken as string}` };

    const memberContext = await app.inject({ method: "GET", url: "/v1/me/context", headers: memberHeaders });
    assert.equal(memberContext.statusCode, 200);
    assert.equal(memberContext.json().subscriptionAccess.mode, "LOCKED");

    const memberRead = await app.inject({ method: "GET", url: "/v1/chapter", headers: memberHeaders });
    assert.equal(memberRead.statusCode, 402);
    assert.equal(memberRead.json().code, "SUBSCRIPTION_REQUIRED");

    await prisma.chapterSubscription.create({
      data: {
        chapterId,
        term: "SEMESTER",
        status: "ACTIVE",
        periodStart: new Date(Date.now() - 60_000),
        periodEnd: new Date(Date.now() + 86_400_000),
        provider: "stripe",
        providerSubscriptionId: `sub_gate_${suffix}`
      }
    });

    const memberReadAfterSubscription = await app.inject({ method: "GET", url: "/v1/chapter", headers: memberHeaders });
    assert.equal(memberReadAfterSubscription.statusCode, 200);
  } finally {
    if (chapterId) await prisma.chapter.deleteMany({ where: { id: chapterId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (universityId) await prisma.university.deleteMany({ where: { id: universityId } });
    await app.close();
    await prisma.$disconnect();
  }
});
