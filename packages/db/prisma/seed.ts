import bcrypt from "bcryptjs";
import { prisma } from "../src/index.js";

const organizations = [
  { name: "Sigma Phi Epsilon", shortName: "SigEp", slug: "sigma-phi-epsilon", primaryColor: "#6F2C91", secondaryColor: "#FFFFFF", accentColor: "#C8102E" },
  { name: "Sigma Chi", shortName: "Sigma Chi", slug: "sigma-chi" },
  { name: "Alpha Tau Omega", shortName: "ATO", slug: "alpha-tau-omega" },
  { name: "Kappa Sigma", shortName: "Kappa Sigma", slug: "kappa-sigma" },
  { name: "Pi Kappa Alpha", shortName: "PIKE", slug: "pi-kappa-alpha" },
  { name: "Lambda Chi Alpha", shortName: "Lambda Chi", slug: "lambda-chi-alpha" },
  { name: "Phi Delta Theta", shortName: "Phi Delt", slug: "phi-delta-theta" },
  { name: "Phi Gamma Delta", shortName: "FIJI", slug: "phi-gamma-delta" },
  { name: "Sigma Alpha Epsilon", shortName: "SAE", slug: "sigma-alpha-epsilon" },
  { name: "Theta Chi", shortName: "Theta Chi", slug: "theta-chi" },
  { name: "Alpha Phi", shortName: "Alpha Phi", slug: "alpha-phi" },
  { name: "Delta Gamma", shortName: "Delta Gamma", slug: "delta-gamma" },
  { name: "Kappa Kappa Gamma", shortName: "Kappa", slug: "kappa-kappa-gamma" },
  { name: "Chi Omega", shortName: "Chi Omega", slug: "chi-omega" },
  { name: "Delta Delta Delta", shortName: "Tri Delta", slug: "delta-delta-delta" },
  { name: "Gamma Phi Beta", shortName: "Gamma Phi", slug: "gamma-phi-beta" },
  { name: "Pi Beta Phi", shortName: "Pi Phi", slug: "pi-beta-phi" }
];

for (const organization of organizations) {
  await prisma.organization.upsert({
    where: { slug: organization.slug },
    create: organization,
    update: organization
  });
}

await prisma.university.upsert({
  where: { name: "Colorado State University" },
  create: {
    name: "Colorado State University",
    shortName: "CSU",
    city: "Fort Collins",
    state: "CO"
  },
  update: {
    shortName: "CSU",
    city: "Fort Collins",
    state: "CO",
    isActive: true
  }
});

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (adminEmail && adminPassword) {
  if (adminPassword.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      firstName: process.env.SEED_ADMIN_FIRST_NAME?.trim() || "Biddly",
      lastName: process.env.SEED_ADMIN_LAST_NAME?.trim() || "Admin",
      passwordHash,
      emailVerified: true,
      platformRole: "PLATFORM_ADMIN"
    },
    update: {
      passwordHash,
      emailVerified: true,
      isActive: true,
      platformRole: "PLATFORM_ADMIN"
    }
  });
}

await prisma.$disconnect();
