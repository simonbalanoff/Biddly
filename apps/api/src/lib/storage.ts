import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

function getClient() {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  ) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
  });
}

export function storageConfigured() {
  return Boolean(getClient());
}

export async function createPrivateUploadUrl(key: string, contentType: string, byteLength: number) {
  const client = getClient();

  if (!client || !env.R2_BUCKET_NAME) {
    return null;
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: byteLength
  });

  return getSignedUrl(client, command, { expiresIn: 10 * 60 });
}

export async function createPrivateDownloadUrl(key: string) {
  const client = getClient();

  if (!client || !env.R2_BUCKET_NAME) {
    return null;
  }

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key
    }),
    { expiresIn: 5 * 60 }
  );
}
