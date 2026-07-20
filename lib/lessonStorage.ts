import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { dirname, relative, resolve } from "path";

export const lessonStorageConfigurationError =
  "PDF storage is not configured for this production deployment. Set the S3 lesson storage environment variables.";

export type LessonStorageMode = "local" | "s3";

type S3LessonStorageConfig = {
  bucket: string;
  client: S3Client;
};

function getS3LessonStorageConfig(): S3LessonStorageConfig | null {
  const bucket = process.env.LESSON_S3_BUCKET?.trim();
  const region = process.env.LESSON_S3_REGION?.trim();
  const accessKeyId = process.env.LESSON_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.LESSON_S3_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.LESSON_S3_ENDPOINT?.trim();

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    client: new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: process.env.LESSON_S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function getLocalStorageRoot() {
  return resolve(process.env.LESSON_LOCAL_STORAGE_PATH || "data/lesson-uploads");
}

function getLocalObjectPath(objectKey: string) {
  const storageRoot = getLocalStorageRoot();
  const objectPath = resolve(storageRoot, objectKey);
  const relativePath = relative(storageRoot, objectPath);

  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error("Invalid lesson storage path.");
  }

  return objectPath;
}

function requireS3LessonStorage() {
  const config = getS3LessonStorageConfig();

  if (!config) {
    throw new Error(lessonStorageConfigurationError);
  }

  return config;
}

export function getLessonStorageMode(): LessonStorageMode | null {
  if (getS3LessonStorageConfig()) {
    return "s3";
  }

  return process.env.NODE_ENV === "production" ? null : "local";
}

export function isLessonStorageConfigured() {
  return getLessonStorageMode() !== null;
}

export async function createLessonUploadUrl(
  objectKey: string,
  contentType: string,
) {
  const { bucket, client } = requireS3LessonStorage();

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: 10 * 60 },
  );
}

export async function createLessonReadUrl(objectKey: string) {
  const { bucket, client } = requireS3LessonStorage();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: 10 * 60 },
  );
}

export async function readLocalLesson(objectKey: string) {
  if (getLessonStorageMode() !== "local") {
    throw new Error(lessonStorageConfigurationError);
  }

  return readFile(getLocalObjectPath(objectKey));
}

export async function storeLocalLessonUpload(
  objectKey: string,
  content: Uint8Array,
  expectedSize: number,
) {
  if (getLessonStorageMode() !== "local") {
    throw new Error(lessonStorageConfigurationError);
  }

  if (content.byteLength !== expectedSize) {
    throw new Error("The uploaded file size did not match the selected PDF.");
  }

  const objectPath = getLocalObjectPath(objectKey);
  await mkdir(dirname(objectPath), { recursive: true });
  await writeFile(objectPath, content);
}

export async function validateUploadedLesson(
  objectKey: string,
  expectedSize: number,
) {
  const mode = getLessonStorageMode();

  if (mode === "local") {
    const objectPath = getLocalObjectPath(objectKey);
    const fileStats = await stat(objectPath);

    if (fileStats.size !== expectedSize) {
      throw new Error("The uploaded file size did not match the selected PDF.");
    }

    const header = await readFile(objectPath, { encoding: "ascii" });
    if (header.slice(0, 5) !== "%PDF-") {
      throw new Error("The uploaded file is not a valid PDF.");
    }

    return;
  }

  const { bucket, client } = requireS3LessonStorage();
  const object = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
  );

  if (object.ContentLength !== expectedSize) {
    throw new Error("The uploaded file size did not match the selected PDF.");
  }

  const firstBytes = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Range: "bytes=0-4",
    }),
  );
  const bytes = await firstBytes.Body?.transformToByteArray();

  if (!bytes || Buffer.from(bytes).toString("ascii") !== "%PDF-") {
    throw new Error("The uploaded file is not a valid PDF.");
  }
}

export async function deleteLessonObject(objectKey: string) {
  if (getLessonStorageMode() === "local") {
    await rm(getLocalObjectPath(objectKey), { force: true });
    return;
  }

  const { bucket, client } = requireS3LessonStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
