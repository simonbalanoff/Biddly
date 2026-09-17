const required = ["DATABASE_URL", "JWT_SECRET", "APP_ORIGIN", "APP_BASE_URL"];
const missing = required.filter((key) => !process.env[key]);
const warnings = [];

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 48) warnings.push("JWT_SECRET should be at least 48 characters in production");
if (process.env.APP_ORIGIN && !process.env.APP_ORIGIN.startsWith("https://")) warnings.push("APP_ORIGIN should use HTTPS in production");
if (process.env.APP_BASE_URL && !process.env.APP_BASE_URL.startsWith("https://")) warnings.push("APP_BASE_URL should use HTTPS in production");
if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) warnings.push("Transactional email is not fully configured");
if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) warnings.push("Private object storage is not fully configured");
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_PRICE_SEMESTER || !process.env.STRIPE_PRICE_ACADEMIC_YEAR) warnings.push("Stripe billing is not fully configured");
if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_PORTAL_CONFIGURATION_ID) warnings.push("Stripe customer portal configuration ID is not set; the Stripe default portal configuration will be used");
if (!process.env.ERROR_REPORT_WEBHOOK_URL) warnings.push("External error reporting is not configured");

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log(warnings.length ? `Preflight passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.` : "Preflight passed.");
