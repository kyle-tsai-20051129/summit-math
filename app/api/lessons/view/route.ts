import { NextResponse } from "next/server";
import { hasValidLessonAccessToken } from "@/lib/lessonAccessToken";
import { getLiveKitConfig } from "@/lib/livekitConfig";
import { getRoomLesson } from "@/lib/roomDatabase";
import { readStoredLesson } from "@/lib/lessonStorage";
import { isValidRoomName } from "@/lib/room";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("roomName")?.trim() ?? "";
  const lessonId = searchParams.get("lessonId")?.trim() ?? "";
  const accessToken = searchParams.get("accessToken") ?? "";
  const download = searchParams.get("download") === "1";
  const config = getLiveKitConfig();

  if (
    !config ||
    !isValidRoomName(roomName) ||
    !lessonId ||
    !hasValidLessonAccessToken(accessToken, roomName, config.apiSecret)
  ) {
    return new NextResponse("Lesson not found.", { status: 403 });
  }

  const lesson = getRoomLesson(roomName, lessonId);
  if (!lesson) {
    return new NextResponse("Lesson not found.", { status: 404 });
  }

  try {
    const file = await readStoredLesson(lesson.objectKey);
    const responseBody = new Uint8Array(file).buffer;
    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${lesson.fileName.replaceAll('"', "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Unable to load this lesson.", { status: 500 });
  }
}
