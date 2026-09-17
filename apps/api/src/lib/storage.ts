import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

function getClient() {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
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

export function storageBucketName() {
  return env.R2_BUCKET_NAME ?? null;
}

export async function listPrivateStorageObjects(maxObjects = 5000) {
  const client = getClient();
  if (!client || !env.R2_BUCKET_NAME) return null;

  const objects: Array<{ key: string; size: number; lastModified: string | null; eTag: string | null }> = [];
  let continuationToken: string | undefined;

  do {
    const remaining = maxObjects - objects.length;
    if (remaining <= 0) break;

    const page = await client.send(new ListObjectsV2Command({
      Bucket: env.R2_BUCKET_NAME,
      ContinuationToken: continuationToken,
      MaxKeys: Math.min(1000, remaining)
    }));

    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      objects.push({
        key: object.Key,
        size: object.Size ?? 0,
        lastModified: object.LastModified?.toISOString() ?? null,
        eTag: object.ETag?.replaceAll('"', "") ?? null
      });
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken && objects.length < maxObjects);

  return { bucket: env.R2_BUCKET_NAME, objects, truncated: Boolean(continuationToken) };
}


export async function privateStorageUsage(prefix: string) {
  const client = getClient();
  if (!client || !env.R2_BUCKET_NAME) return null;
  let continuationToken: string | undefined;
  let totalBytes = 0;
  let objectCount = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: env.R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000
    }));
    for (const object of page.Contents ?? []) {
      totalBytes += object.Size ?? 0;
      objectCount += 1;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { totalBytes, objectCount };
}

export async function deletePrivateStorageObjects(keys: string[]) {
  const client = getClient();
  if (!client || !env.R2_BUCKET_NAME) return null;
  if (!keys.length) return { deleted: [], errors: [] as Array<{ key: string; code: string | null; message: string | null }> };

  const deleted: string[] = [];
  const errors: Array<{ key: string; code: string | null; message: string | null }> = [];

  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: env.R2_BUCKET_NAME,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false }
    }));
    for (const item of result.Deleted ?? []) if (item.Key) deleted.push(item.Key);
    for (const item of result.Errors ?? []) if (item.Key) errors.push({ key: item.Key, code: item.Code ?? null, message: item.Message ?? null });
  }

  return { deleted, errors };
}

export async function createPrivateUploadUrl(key: string, contentType: string, byteLength: number) {
  const client = getClient();
  if (!client || !env.R2_BUCKET_NAME) return null;

  return getSignedUrl(client, new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: byteLength
  }), { expiresIn: 10 * 60 });
}

export async function createPrivateDownloadUrl(key: string) {
  const client = getClient();
  if (!client || !env.R2_BUCKET_NAME) return null;

  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }), { expiresIn: 5 * 60 });
}
