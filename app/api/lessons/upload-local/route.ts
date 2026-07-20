import { NextResponse } from "next/server";
import { hasRoomHostAccess } from "@/lib/lessonAccess";
import { getPendingLessonUpload } from "@/lib/roomDatabase";
import { getLessonStorageMode, storeLocalLessonUpload } from "@/lib/lessonStorage";
import { isValidRoomName } from "@/lib/room";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  if (getLessonStorageMode() !== "local") {
    return NextResponse.json({ error: "Local PDF uploads are unavailable." }, { status: 404 });
  }

  const roomName = request.headers.get("x-room-name")?.trim() ?? "";
  const hostKey = request.headers.get("x-host-key")?.trim() ?? "";
  const uploadId = request.headers.get("x-upload-id")?.trim() ?? "";

  if (!isValidRoomName(roomName) || !uploadId || !hasRoomHostAccess(roomName, hostKey)) {
    return NextResponse.json({ error: "Unauthorized PDF upload." }, { status: 403 });
  }

  const upload = getPendingLessonUpload(uploadId, roomName);
  if (!upload) {
    return NextResponse.json(
      { error: "This upload has expired. Select the PDF and try again." },
      { status: 410 },
    );
  }

  try {
    const content = new Uint8Array(await request.arrayBuffer());
    await storeLocalLessonUpload(upload.object_key, content, upload.size_bytes);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to store the uploaded PDF.",
      },
      { status: 400 },
    );
  }
}
