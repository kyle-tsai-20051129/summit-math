import { NextResponse } from "next/server";
import { hasRoomHostAccess } from "@/lib/lessonAccess";
import { createPendingLessonUpload } from "@/lib/roomDatabase";
import {
  createLessonUploadUrl,
  getLessonStorageMode,
  isLessonStorageConfigured,
  lessonStorageConfigurationError,
} from "@/lib/lessonStorage";
import { isValidRoomName } from "@/lib/room";
import { checkRateLimit, getRequestClientKey } from "@/lib/requestRateLimit";

export const runtime = "nodejs";

const maximumLessonSizeBytes = 25 * 1024 * 1024;
const uploadRateLimit = { maxRequests: 6, windowMs: 15 * 60 * 1000 };

function readString(body: unknown, field: string) {
  return typeof body === "object" && body !== null && field in body &&
    typeof body[field as keyof typeof body] === "string"
    ? (body[field as keyof typeof body] as string).trim()
    : "";
}

function readSize(body: unknown) {
  return typeof body === "object" && body !== null && "sizeBytes" in body &&
    typeof body.sizeBytes === "number"
    ? body.sizeBytes
    : 0;
}

function isValidPdfUpload(fileName: string, contentType: string, sizeBytes: number) {
  return (
    fileName.length > 0 &&
    fileName.length <= 180 &&
    fileName.toLowerCase().endsWith(".pdf") &&
    (contentType === "application/pdf" || contentType === "") &&
    Number.isInteger(sizeBytes) &&
    sizeBytes > 0 &&
    sizeBytes <= maximumLessonSizeBytes
  );
}

export async function POST(request: Request) {
  if (!isLessonStorageConfigured()) {
    return NextResponse.json(
      { error: lessonStorageConfigurationError },
      { status: 503 },
    );
  }

  const rateLimit = checkRateLimit(
    `lesson-upload:${getRequestClientKey(request)}`,
    uploadRateLimit.maxRequests,
    uploadRateLimit.windowMs,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many upload attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const roomName = readString(body, "roomName");
  const hostKey = readString(body, "hostKey");
  const originalFilename = readString(body, "fileName");
  const contentType = readString(body, "contentType");
  const sizeBytes = readSize(body);

  if (!isValidRoomName(roomName) || !isValidPdfUpload(originalFilename, contentType, sizeBytes)) {
    return NextResponse.json(
      { error: "Select a PDF no larger than 25 MB." },
      { status: 400 },
    );
  }

  if (!hasRoomHostAccess(roomName, hostKey)) {
    return NextResponse.json(
      { error: "Only the room host can upload teaching materials." },
      { status: 403 },
    );
  }

  const uploadId = crypto.randomUUID();
  const objectKey = `lessons/${roomName}/${crypto.randomUUID()}.pdf`;

  try {
    createPendingLessonUpload(
      uploadId,
      roomName,
      objectKey,
      originalFilename,
      "application/pdf",
      sizeBytes,
    );

    const storageMode = getLessonStorageMode();
    if (storageMode === "local") {
      return NextResponse.json({
        uploadId,
        uploadMode: "local",
        uploadUrl: "/api/lessons/upload-local",
      });
    }

    const uploadUrl = await createLessonUploadUrl(objectKey, "application/pdf");

    return NextResponse.json({ uploadId, uploadUrl, uploadMode: "s3" });
  } catch (error) {
    console.error("Unable to prepare lesson upload", {
      roomName,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Unable to prepare the PDF upload. Please try again." },
      { status: 500 },
    );
  }
}
