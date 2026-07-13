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
  last_active_at: number;
};

type WaitingRoomRow = {
  request_id: string;
  display_name: string;
  created_at: number;
  status: WaitingRoomRequest["status"];
};

export type StoredRoomSettings = {
  roomName: string;
  access?: RoomAccessMetadata["access"];
  host?: RoomAccessMetadata["host"];
  locked: boolean;
  waitingRoomEnabled: boolean;
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
