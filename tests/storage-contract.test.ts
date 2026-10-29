import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import type { StoredFile } from "@prisma/client";
import { storageProvider } from "../src/lib/storage/provider";
test("S3 SDK adapter contract: signed private upload/download/delete, encryption, version and health", async () => {
  const bytes = Buffer.from("private-test-object");
  let object: Buffer | undefined;
  const operations: string[] = [];
  const server = createServer(async (request, response) => {
    if (
      !request.headers.authorization?.startsWith(
        "AWS4-HMAC-SHA256 Credential=contract-key/",
      )
    ) {
      response.statusCode = 403;
      response.end();
      return;
    }
    operations.push(request.method!);
    if (request.method === "HEAD") {
      response.statusCode = 200;
      response.end();
      return;
    }
    if (request.method === "PUT") {
      assert.equal(request.headers["x-amz-server-side-encryption"], "AES256");
      assert.equal(request.headers["content-type"], "image/webp");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      object = Buffer.concat(chunks);
      response.setHeader("x-amz-version-id", "version-1");
      response.end();
    } else if (request.method === "GET") {
      assert.ok(request.url?.includes("versionId=version-1"));
      if (!object) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("content-length", object.length);
      response.end(object);
    } else if (request.method === "DELETE") {
      object = undefined;
      response.statusCode = 204;
      response.end();
    } else {
      response.statusCode = 405;
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const keys = [
    "FILE_STORAGE_ENDPOINT",
    "FILE_STORAGE_REGION",
    "FILE_STORAGE_BUCKET",
    "FILE_STORAGE_ACCESS_KEY",
    "FILE_STORAGE_SECRET_KEY",
    "FILE_STORAGE_PATH_STYLE",
  ];
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    FILE_STORAGE_ENDPOINT: endpoint,
    FILE_STORAGE_REGION: "us-east-1",
    FILE_STORAGE_BUCKET: "private-contract",
    FILE_STORAGE_ACCESS_KEY: "contract-key",
    FILE_STORAGE_SECRET_KEY: "contract-secret",
    FILE_STORAGE_PATH_STYLE: "true",
  });
  const file: StoredFile = {
    id: randomUUID(),
    objectKey: "evidence/" + randomUUID(),
    provider: "S3",
    state: "READY",
    originalName: "test.webp",
    contentType: "image/webp",
    size: bytes.length,
    originalSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storageVersion: null,
    data: null,
    createdById: null,
    createdAt: new Date(),
    archivedAt: null,
    cleanupPending: false,
  };
  try {
    const adapter = storageProvider("S3");
    await adapter.health();
    assert.equal(
      (await fetch(endpoint + "/private-contract/" + file.objectKey)).status,
      403,
    );
    file.storageVersion = (await adapter.put(file, bytes))!;
    assert.equal(file.storageVersion, "version-1");
    assert.deepEqual(Buffer.from(await adapter.get(file)), bytes);
    await adapter.delete(file);
    assert.equal(object, undefined);
    assert.deepEqual(operations, ["HEAD", "PUT", "GET", "DELETE"]);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
