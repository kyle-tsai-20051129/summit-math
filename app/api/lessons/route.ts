import { NextResponse } from "next/server";
import { hasRoomHostAccess } from "@/lib/lessonAccess";
import {
  createRoomLesson,
  deleteRoomLesson,
  getActiveLessonPresentation,
  getRoomLessons,
  setActiveLessonPresentation,
  takePendingLessonUpload,
} from "@/lib/roomDatabase";
import { deleteLessonObject, validateUploadedLesson } from "@/lib/lessonStorage";
import { isValidRoomName } from "@/lib/room";

export const runtime = "nodejs";

function readString(body: unknown, field: string) {
  return typeof body === "object" && body !== null && field in body &&
    typeof body[field as keyof typeof body] === "string"
    ? (body[field as keyof typeof body] as string).trim()
    : "";
}

function unauthorizedHostResponse() {
  return NextResponse.json(
    { error: "Only the room host can manage teaching materials." },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid lesson request." }, { status: 400 });
  }

  const roomName = readString(body, "roomName");
  const hostKey = readString(body, "hostKey");
  const action = readString(body, "action");
  const uploadId = readString(body, "uploadId");
  const lessonId = readString(body, "lessonId");

  if (
    !isValidRoomName(roomName) ||
    (action !== "list" && action !== "remove" && !uploadId) ||
    (action === "remove" && !lessonId)
  ) {
    return NextResponse.json({ error: "Invalid lesson request." }, { status: 400 });
  }

  if (!hasRoomHostAccess(roomName, hostKey)) {
    return unauthorizedHostResponse();
  }

  if (action === "list") {
    return NextResponse.json({ lessons: getRoomLessons(roomName) });
  }

  if (action === "remove") {
    const lesson = deleteRoomLesson(roomName, lessonId);
    if (!lesson) {
      return NextResponse.json(
        { error: "That lesson is no longer available." },
        { status: 404 },
      );
    }

    try {
      await deleteLessonObject(lesson.objectKey);
    } catch {
      // The removed lesson can no longer be opened, even if storage cleanup fails.
    }

    if (getActiveLessonPresentation(roomName)?.lessonId === lessonId) {
      setActiveLessonPresentation(roomName, null);
    }

    return NextResponse.json({ removedLessonId: lessonId });
  }

  if (action !== "finalize") {
    return NextResponse.json({ error: "Invalid lesson action." }, { status: 400 });
  }

  const upload = takePendingLessonUpload(uploadId, roomName);
  if (!upload) {
    return NextResponse.json(
      { error: "This upload has expired. Select the PDF and try again." },
      { status: 410 },
    );
  }

  try {
    await validateUploadedLesson(upload.object_key, upload.size_bytes);
    const lessonId = crypto.randomUUID();
    createRoomLesson(
      lessonId,
      roomName,
      upload.object_key,
      upload.original_filename,
      upload.size_bytes,
    );

    return NextResponse.json({
      lesson: {
        id: lessonId,
        fileName: upload.original_filename,
        sizeBytes: upload.size_bytes,
      },
    });
  } catch (error) {
    try {
      await deleteLessonObject(upload.object_key);
    } catch {
      // The object is private and will be overwritten by a new upload attempt.
    }

    const message =
      error instanceof Error && error.message === "The uploaded file is not a valid PDF."
        ? error.message
        : "Unable to validate the uploaded PDF. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
