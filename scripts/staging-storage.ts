import "dotenv/config";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { fetch, EnvHttpProxyAgent } from "undici";
import { validateEnvironment, configuredAppUrl } from "../src/lib/environment";
import { storageProvider, s3Client } from "../src/lib/storage/provider";
import { storageCanary } from "../src/lib/storage/acceptance";
async function main() {
  if (
    process.env.APP_ENV !== "production" ||
    process.env.DEPLOYMENT_TIER !== "staging" ||
    process.env.STAGING_ACCEPTANCE_CONFIRM !== configuredAppUrl()
  )
    throw new Error("Explicit staging target confirmation is required.");
  validateEnvironment();
  const agent = new EnvHttpProxyAgent();
  try {
    const result = await storageCanary(
      storageProvider("S3"),
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: "white" },
      })
        .webp()
        .toBuffer(),
      async (file) => {
        const metadata = await s3Client().send(
          new HeadObjectCommand({
            Bucket: process.env.FILE_STORAGE_BUCKET,
            Key: file.objectKey,
            VersionId: file.storageVersion ?? undefined,
          }),
        );
        if (
          metadata.ContentType !== file.contentType ||
          metadata.ContentLength !== file.size
        )
          throw new Error("Metadata acceptance failed");
        return {
          encrypted: !!metadata.ServerSideEncryption,
          versioned: !!metadata.VersionId && metadata.VersionId !== "null",
        };
      },
      async (file) => {
        const endpoint = process.env.FILE_STORAGE_ENDPOINT;
        let url: URL;
        if (endpoint) {
          url = new URL(endpoint);
          if (process.env.FILE_STORAGE_PATH_STYLE === "true")
            url.pathname =
              url.pathname.replace(/\/$/, "") +
              "/" +
              process.env.FILE_STORAGE_BUCKET +
              "/" +
              file.objectKey;
          else {
            url.hostname = process.env.FILE_STORAGE_BUCKET + "." + url.hostname;
            url.pathname = "/" + file.objectKey;
          }
        } else
          url = new URL(
            `https://${process.env.FILE_STORAGE_BUCKET}.s3.${process.env.FILE_STORAGE_REGION}.amazonaws.com/${file.objectKey}`,
          );
        const response = await fetch(url, {
          dispatcher: agent,
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        });
        await response.body?.cancel();
        return response.status;
      },
      async (file) => {
        try {
          await s3Client().send(
            new HeadObjectCommand({
              Bucket: process.env.FILE_STORAGE_BUCKET,
              Key: file.objectKey,
              VersionId: file.storageVersion ?? undefined,
            }),
          );
          return false;
        } catch (error) {
          return (
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode === 404
          );
        }
      },
    );
    console.info(
      JSON.stringify({
        check: "real_staging_storage",
        ...result,
        canaryDelete: true,
        launchStatus: "NOT_DETERMINED",
        remaining:
          "Verify app authorization/archive, outage response and independent backup replication using the staging checklist.",
      }),
    );
  } finally {
    await agent.close();
  }
}
main().catch(() => {
  console.error(
    "Staging storage acceptance failed or is not configured. Verify the explicit isolated target, IAM, TLS, private access, encryption, versioning and canary cleanup. No credentials are logged.",
  );
  process.exitCode = 1;
});
