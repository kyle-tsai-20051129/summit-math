import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import {
  RoomAccessMetadata,
  WaitingRoomRequest,
} from "@/lib/serverRoomAccess";

type RoomRow = {
  room_name: string;
  password_salt: string | null;
  password_hash: string | null;
  host_salt: string | null;
  host_key_hash: string | null;
  locked: number;
  waiting_room_enabled: number;
  active_lesson_id: string | null;
  active_lesson_page: number | null;
  last_active_at: number;
};

type WaitingRoomRow = {
  request_id: string;
  display_name: string;
  created_at: number;
  status: WaitingRoomRequest["status"];
};

type PendingLessonUploadRow = {
  upload_id: string;
  room_name: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  expires_at: number;
};

type RoomLessonRow = {
  lesson_id: string;
  original_filename: string;
  size_bytes: number;
  created_at: number;
};

export type RoomLesson = {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: number;
};

export type ActiveLessonPresentation = {
  lessonId: string;
  page: number;
};

export type StoredRoomSettings = {
  roomName: string;
  access?: RoomAccessMetadata["access"];
  host?: RoomAccessMetadata["host"];
  locked: boolean;
  waitingRoomEnabled: boolean;
  activeLessonPresentation?: ActiveLessonPresentation;
};

const waitingRequestLifetimeMs = 2 * 60 * 60 * 1000;

let database: Database.Database | null = null;

function getDatabasePath() {
  return resolve(process.env.ROOM_DATABASE_PATH || "data/summit-video.db");
}

function getDatabase() {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });
  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS room_settings (
      room_name TEXT PRIMARY KEY,
      password_salt TEXT,
      password_hash TEXT,
      host_salt TEXT,
      host_key_hash TEXT,
      locked INTEGER NOT NULL DEFAULT 0,
      waiting_room_enabled INTEGER NOT NULL DEFAULT 0,
      active_lesson_id TEXT,
      active_lesson_page INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS waiting_room_requests (
      request_id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'admitted', 'denied')),
      FOREIGN KEY (room_name) REFERENCES room_settings(room_name) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS waiting_room_requests_room_name_idx
      ON waiting_room_requests(room_name, created_at);
    CREATE TABLE IF NOT EXISTS pending_lesson_uploads (
      upload_id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (room_name) REFERENCES room_settings(room_name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS room_lessons (
      lesson_id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_name) REFERENCES room_settings(room_name) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS room_lessons_room_name_idx
      ON room_lessons(room_name, created_at DESC);
  `);

  // Existing installations created before expiration support need this migration.
  const columns = database
    .prepare("PRAGMA table_info(room_settings)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "last_active_at")) {
    database.exec("ALTER TABLE room_settings ADD COLUMN last_active_at INTEGER");
    database.exec(
      "UPDATE room_settings SET last_active_at = updated_at WHERE last_active_at IS NULL",
    );
  }

  if (!columns.some((column) => column.name === "active_lesson_id")) {
    database.exec("ALTER TABLE room_settings ADD COLUMN active_lesson_id TEXT");
  }
  if (!columns.some((column) => column.name === "active_lesson_page")) {
    database.exec("ALTER TABLE room_settings ADD COLUMN active_lesson_page INTEGER");
  }

  return database;
}

function toStoredRoomSettings(row: RoomRow): StoredRoomSettings {
  return {
    roomName: row.room_name,
    access:
      row.password_salt && row.password_hash
        ? { salt: row.password_salt, passwordHash: row.password_hash }
        : undefined,
    host:
      row.host_salt && row.host_key_hash
        ? { salt: row.host_salt, keyHash: row.host_key_hash }
        : undefined,
    locked: Boolean(row.locked),
    waitingRoomEnabled: Boolean(row.waiting_room_enabled),
    activeLessonPresentation:
      row.active_lesson_id && row.active_lesson_page
        ? { lessonId: row.active_lesson_id, page: row.active_lesson_page }
        : undefined,
  };
}

export function getRoomSettings(roomName: string) {
  const row = getDatabase()
    .prepare("SELECT * FROM room_settings WHERE room_name = ?")
    .get(roomName) as RoomRow | undefined;

  return row ? toStoredRoomSettings(row) : null;
}

export function createRoomSettings(
  roomName: string,
  metadata: RoomAccessMetadata,
) {
  const now = Date.now();
  const result = getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO room_settings (
        room_name, password_salt, password_hash, host_salt, host_key_hash,
        locked, waiting_room_enabled, created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      roomName,
      metadata.access?.salt ?? null,
      metadata.access?.passwordHash ?? null,
      metadata.host?.salt ?? null,
      metadata.host?.keyHash ?? null,
      metadata.settings?.locked ? 1 : 0,
      metadata.settings?.waitingRoomEnabled ? 1 : 0,
      now,
      now,
      now,
    );

  return result.changes > 0 ? getRoomSettings(roomName) : null;
}

export function getOrMigrateRoomSettings(
  roomName: string,
  metadata: RoomAccessMetadata,
) {
  return getRoomSettings(roomName) ?? createRoomSettings(roomName, metadata) ?? getRoomSettings(roomName);
}

export function toRoomAccessMetadata(settings: StoredRoomSettings): RoomAccessMetadata {
  return {
    access: settings.access,
    host: settings.host,
    settings: {
      locked: settings.locked,
      waitingRoomEnabled: settings.waitingRoomEnabled,
    },
  };
}

export function setRoomLocked(roomName: string, locked: boolean) {
  getDatabase()
    .prepare("UPDATE room_settings SET locked = ?, updated_at = ? WHERE room_name = ?")
    .run(locked ? 1 : 0, Date.now(), roomName);
}

export function touchRoomActivity(roomName: string) {
  const now = Date.now();
  getDatabase()
    .prepare(
      "UPDATE room_settings SET updated_at = ?, last_active_at = ? WHERE room_name = ?",
    )
    .run(now, now, roomName);
}

export function getRoomNamesInactiveSince(cutoff: number) {
  const rows = getDatabase()
    .prepare("SELECT room_name FROM room_settings WHERE last_active_at < ?")
    .all(cutoff) as Array<{ room_name: string }>;

  return rows.map((row) => row.room_name);
}

export function deleteRoomSettings(roomName: string) {
  getDatabase()
    .prepare("DELETE FROM room_settings WHERE room_name = ?")
    .run(roomName);
}

function removeExpiredWaitingRequests(roomName: string) {
  getDatabase()
    .prepare("DELETE FROM waiting_room_requests WHERE room_name = ? AND created_at < ?")
    .run(roomName, Date.now() - waitingRequestLifetimeMs);
}

export function getWaitingRoomRequestsForRoom(roomName: string) {
  removeExpiredWaitingRequests(roomName);
  const rows = getDatabase()
    .prepare(
      "SELECT request_id, display_name, created_at, status FROM waiting_room_requests WHERE room_name = ? ORDER BY created_at ASC",
    )
    .all(roomName) as WaitingRoomRow[];

  return rows.map((row) => ({
    id: row.request_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    status: row.status,
  }));
}

export function createWaitingRoomRequest(
  roomName: string,
  requestId: string,
  displayName: string,
) {
  getDatabase()
    .prepare(
      "INSERT INTO waiting_room_requests (request_id, room_name, display_name, created_at, status) VALUES (?, ?, ?, ?, 'pending')",
    )
    .run(requestId, roomName, displayName, Date.now());
}

export function setWaitingRoomRequestStatus(
  roomName: string,
  requestId: string,
  status: Exclude<WaitingRoomRequest["status"], "pending">,
) {
  const result = getDatabase()
    .prepare(
      "UPDATE waiting_room_requests SET status = ? WHERE room_name = ? AND request_id = ? AND status = 'pending'",
    )
    .run(status, roomName, requestId);

  return result.changes > 0;
}

export function removeWaitingRoomRequest(roomName: string, requestId: string) {
  getDatabase()
    .prepare("DELETE FROM waiting_room_requests WHERE room_name = ? AND request_id = ?")
    .run(roomName, requestId);
}

function removeExpiredPendingLessonUploads() {
  getDatabase()
    .prepare("DELETE FROM pending_lesson_uploads WHERE expires_at < ?")
    .run(Date.now());
}

export function createPendingLessonUpload(
  uploadId: string,
  roomName: string,
  objectKey: string,
  originalFilename: string,
  contentType: string,
  sizeBytes: number,
) {
  removeExpiredPendingLessonUploads();
  getDatabase()
    .prepare(
      `INSERT INTO pending_lesson_uploads (
        upload_id, room_name, object_key, original_filename, content_type,
        size_bytes, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uploadId,
      roomName,
      objectKey,
      originalFilename,
      contentType,
      sizeBytes,
      Date.now() + 15 * 60 * 1000,
    );
}

export function takePendingLessonUpload(uploadId: string, roomName: string) {
  removeExpiredPendingLessonUploads();
  const database = getDatabase();
  const upload = database
    .prepare(
      `SELECT upload_id, room_name, object_key, original_filename, content_type,
        size_bytes, expires_at
       FROM pending_lesson_uploads WHERE upload_id = ? AND room_name = ?`,
    )
    .get(uploadId, roomName) as PendingLessonUploadRow | undefined;

  if (upload) {
    database
      .prepare("DELETE FROM pending_lesson_uploads WHERE upload_id = ?")
      .run(uploadId);
  }

  return upload ?? null;
}

export function getPendingLessonUpload(uploadId: string, roomName: string) {
  removeExpiredPendingLessonUploads();

  return (getDatabase()
    .prepare(
      `SELECT upload_id, room_name, object_key, original_filename, content_type,
        size_bytes, expires_at
       FROM pending_lesson_uploads WHERE upload_id = ? AND room_name = ?`,
    )
    .get(uploadId, roomName) as PendingLessonUploadRow | undefined) ?? null;
}

export function createRoomLesson(
  lessonId: string,
  roomName: string,
  objectKey: string,
  originalFilename: string,
  sizeBytes: number,
) {
  getDatabase()
    .prepare(
      `INSERT INTO room_lessons (
        lesson_id, room_name, object_key, original_filename, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      lessonId,
      roomName,
      objectKey,
      originalFilename,
      sizeBytes,
      Date.now(),
    );
}

export function getRoomLessons(roomName: string): RoomLesson[] {
  const rows = getDatabase()
    .prepare(
      `SELECT lesson_id, original_filename, size_bytes, created_at
       FROM room_lessons WHERE room_name = ? ORDER BY created_at DESC`,
    )
    .all(roomName) as RoomLessonRow[];

  return rows.map((row) => ({
    id: row.lesson_id,
    fileName: row.original_filename,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }));
}

export function getRoomLesson(roomName: string, lessonId: string) {
  const row = getDatabase()
    .prepare(
      `SELECT lesson_id, object_key, original_filename, size_bytes, created_at
       FROM room_lessons WHERE room_name = ? AND lesson_id = ?`,
    )
    .get(roomName, lessonId) as
    | (RoomLessonRow & { object_key: string })
    | undefined;

  return row
    ? {
        id: row.lesson_id,
        objectKey: row.object_key,
        fileName: row.original_filename,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
      }
    : null;
}

export function getActiveLessonPresentation(roomName: string) {
  return getRoomSettings(roomName)?.activeLessonPresentation ?? null;
}

export function setActiveLessonPresentation(
  roomName: string,
  presentation: ActiveLessonPresentation | null,
) {
  getDatabase()
    .prepare(
      `UPDATE room_settings
       SET active_lesson_id = ?, active_lesson_page = ?, updated_at = ?, last_active_at = ?
       WHERE room_name = ?`,
    )
    .run(
      presentation?.lessonId ?? null,
      presentation?.page ?? null,
      Date.now(),
      Date.now(),
      roomName,
    );
}

export function getRoomLessonObjectKeys(roomName: string) {
  const rows = getDatabase()
    .prepare("SELECT object_key FROM room_lessons WHERE room_name = ?")
    .all(roomName) as Array<{ object_key: string }>;

  return rows.map((row) => row.object_key);
}
