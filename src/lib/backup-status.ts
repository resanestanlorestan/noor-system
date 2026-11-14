// Dashboard «آخرین پشتیبان موفق» panel data (Release 2.4 — فاز ۴).
// The production backup script writes a JSON marker to .private-app/last-backup
// on every successful run; this module reads it defensively (any error → null)
// so the dashboard never breaks because of a missing or corrupt marker.
import { readFile } from "node:fs/promises";
import path from "node:path";

export type BackupMarker = {
  ok: boolean; at: string; file: string; sizeBytes: number; sha256: string; durationMs: number; retention: number;
};

const MARKER_PATH = process.env.APP_PRIVATE_DIR
  ? path.join(process.env.APP_PRIVATE_DIR, "last-backup")
  : path.join(process.cwd(), ".private-app", "last-backup");

export async function readBackupMarker(): Promise<BackupMarker | null> {
  try {
    const raw = await readFile(MARKER_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<BackupMarker>;
    if (!parsed || parsed.ok !== true || typeof parsed.at !== "string" || typeof parsed.file !== "string") return null;
    return {
      ok: true, at: parsed.at, file: parsed.file,
      sizeBytes: Number(parsed.sizeBytes) || 0, sha256: String(parsed.sha256 || ""),
      durationMs: Number(parsed.durationMs) || 0, retention: Number(parsed.retention) || 14,
    };
  } catch { return null; }
}

/** Human-readable byte size in Persian context (binary units, latin digits). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "۰ بایت";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
