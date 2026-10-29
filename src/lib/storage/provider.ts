import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpsProxyAgent } from "https-proxy-agent";
import { db } from "../db";
import type { StoredFile } from "@prisma/client";
export interface ObjectStorage {
  put(file: StoredFile, data: Uint8Array): Promise<string | undefined>;
  get(file: StoredFile): Promise<Uint8Array>;
  delete(file: StoredFile): Promise<void>;
  health(): Promise<void>;
}
let s3: S3Client | undefined;
export function s3Client() {
  if (!s3) {
    const endpoint = process.env.FILE_STORAGE_ENDPOINT;
    const local =
      endpoint &&
      ["127.0.0.1", "localhost", "[::1]"].includes(new URL(endpoint).hostname);
    const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
    s3 = new S3Client({
      region: process.env.FILE_STORAGE_REGION,
      endpoint,
      forcePathStyle: process.env.FILE_STORAGE_PATH_STYLE === "true",
      credentials: process.env.FILE_STORAGE_ACCESS_KEY
        ? {
            accessKeyId: process.env.FILE_STORAGE_ACCESS_KEY,
            secretAccessKey: process.env.FILE_STORAGE_SECRET_KEY!,
          }
        : undefined,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 3000,
        requestTimeout: 10000,
        ...(proxy && !local ? { httpsAgent: new HttpsProxyAgent(proxy) } : {}),
      }),
      maxAttempts: 2,
    });
  }
  return s3;
}
const bucket = () => process.env.FILE_STORAGE_BUCKET!;
const database: ObjectStorage = {
  async put(file, data) {
    await db.storedFile.update({
      where: { id: file.id },
      data: { data: new Uint8Array(data) },
    });
    return undefined;
  },
  async get(file) {
    const row = await db.storedFile.findUniqueOrThrow({
      where: { id: file.id },
      select: { data: true },
    });
    if (!row.data) throw new Error("Missing file");
    return row.data;
  },
  async delete(file) {
    await db.storedFile.update({
      where: { id: file.id },
      data: { data: null },
    });
  },
  async health() {
    await db.$queryRaw`SELECT 1`;
  },
};
const object: ObjectStorage = {
  async put(file, data) {
    const result = await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: file.objectKey,
        Body: data,
        ContentType: file.contentType,
        ServerSideEncryption: process.env.FILE_STORAGE_KMS_KEY
          ? "aws:kms"
          : "AES256",
        SSEKMSKeyId: process.env.FILE_STORAGE_KMS_KEY,
        Metadata: { sha256: file.sha256 },
      }),
    );
    return result.VersionId;
  },
  async get(file) {
    const result = await s3Client().send(
      new GetObjectCommand({
        Bucket: bucket(),
        Key: file.objectKey,
        VersionId: file.storageVersion ?? undefined,
      }),
    );
    if (!result.Body) throw new Error("Missing object");
    return result.Body.transformToByteArray();
  },
  async delete(file) {
    await s3Client().send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: file.objectKey,
        VersionId: file.storageVersion ?? undefined,
      }),
    );
  },
  async health() {
    await s3Client().send(new HeadBucketCommand({ Bucket: bucket() }));
  },
};
export function storageProvider(
  provider: StoredFile["provider"] = process.env.FILE_STORAGE_PROVIDER === "s3"
    ? "S3"
    : "DATABASE",
): ObjectStorage {
  return provider === "S3" ? object : database;
}
