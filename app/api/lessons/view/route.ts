import { NextResponse } from "next/server";
import { hasValidLessonAccessToken } from "@/lib/lessonAccessToken";
import { getLiveKitConfig } from "@/lib/livekitConfig";
import { getRoomLesson } from "@/lib/roomDatabase";
import { createLessonReadUrl, getLessonStorageMode, readLocalLesson } from "@/lib/lessonStorage";
import { isValidRoomName } from "@/lib/room";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("roomName")?.trim() ?? "";
  const lessonId = searchParams.get("lessonId")?.trim() ?? "";
  const accessToken = searchParams.get("accessToken") ?? "";
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

  if (getLessonStorageMode() === "local") {
    const file = await readLocalLesson(lesson.objectKey);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${lesson.fileName.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.redirect(await createLessonReadUrl(lesson.objectKey));
}
