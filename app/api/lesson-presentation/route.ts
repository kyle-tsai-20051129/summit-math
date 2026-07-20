import { NextResponse } from "next/server";
import { hasValidLessonAccessToken } from "@/lib/lessonAccessToken";
import { hasRoomHostAccess } from "@/lib/lessonAccess";
import {
  getActiveLessonPresentation,
  getRoomLesson,
  setActiveLessonPresentation,
} from "@/lib/roomDatabase";
import { getLiveKitConfig } from "@/lib/livekitConfig";
import { isValidRoomName } from "@/lib/room";

export const runtime = "nodejs";

function toPresentation(roomName: string) {
  const presentation = getActiveLessonPresentation(roomName);
  if (!presentation) {
    return null;
  }

  const lesson = getRoomLesson(roomName, presentation.lessonId);
  return lesson ? { lesson: { id: lesson.id, fileName: lesson.fileName }, page: presentation.page } : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("roomName")?.trim() ?? "";
  const accessToken = searchParams.get("accessToken") ?? "";
  const config = getLiveKitConfig();

  if (
    !config ||
    !isValidRoomName(roomName) ||
    !hasValidLessonAccessToken(accessToken, roomName, config.apiSecret)
  ) {
    return NextResponse.json({ error: "Lesson access is unavailable." }, { status: 403 });
  }

  return NextResponse.json({ presentation: toPresentation(roomName) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid lesson presentation request." }, { status: 400 });
  }

  const value: Record<string, unknown> =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const roomName = typeof value.roomName === "string" ? value.roomName.trim() : "";
  const hostKey = typeof value.hostKey === "string" ? value.hostKey.trim() : "";
  const action = typeof value.action === "string" ? value.action : "";
  const lessonId = typeof value.lessonId === "string" ? value.lessonId.trim() : "";
  const page = typeof value.page === "number" ? value.page : 0;

  if (!isValidRoomName(roomName) || !hasRoomHostAccess(roomName, hostKey)) {
    return NextResponse.json({ error: "Only the room host can present lessons." }, { status: 403 });
  }

  if (action === "hide") {
    setActiveLessonPresentation(roomName, null);
    return NextResponse.json({ presentation: null });
  }

  if ((action !== "show" && action !== "page") || !lessonId || !Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "Invalid lesson presentation request." }, { status: 400 });
  }

  if (!getRoomLesson(roomName, lessonId)) {
    return NextResponse.json({ error: "That lesson is no longer available." }, { status: 404 });
  }

  setActiveLessonPresentation(roomName, { lessonId, page });
  return NextResponse.json({ presentation: toPresentation(roomName) });
}
