// Tests for the production backup pipeline: the shell scripts run against the
// real PostgreSQL feature database, produce a custom-format dump with a valid
// checksum, update the dashboard marker file and write the audit row. The
// restore script's --verify mode round-trips the dump.
//
// On hosts without a pg client in PATH the suite is skipped automatically;
// point PG_DUMP / PG_RESTORE / PSQL at a client installation to run it (see
// docs/BACKUP-RESTORE.md §7).
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./feature/env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { formatBytes } from "@/lib/backup-status";

const REPO = process.cwd();
const PG_DUMP = process.env.PG_DUMP || "pg_dump";
const PG_RESTORE = process.env.PG_RESTORE || "pg_restore";
const PSQL = process.env.PSQL || "psql";

function run(cmd: string, args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env } });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", () => resolve({ code: -1, stdout, stderr }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

const pgClientAvailable = await new Promise<boolean>((resolve) => {
  const probe = spawn(PG_DUMP, ["--version"]);
  probe.on("error", () => resolve(false));
  probe.on("close", (code) => resolve(code === 0));
});

const suite = pgClientAvailable ? describe : describe.skip;

let workspace: string;
let backupDir: string;
let markerDir: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "noor-backup-"));
  backupDir = path.join(workspace, "backups");
  markerDir = path.join(workspace, "private");
}, 30_000);
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

/** Built lazily: backupDir/markerDir only exist after beforeAll ran. */
function scriptEnv(): Record<string, string> {
  return {
    DATABASE_URL: process.env.DATABASE_URL!, // pinned to noor_feature by tests/feature/env.ts
    PG_DUMP, PG_RESTORE, PSQL,
    BACKUP_DIR: backupDir, APP_PRIVATE_DIR: markerDir, BACKUP_KEEP: "3",
  };
}

suite("خط لوله پشتیبان‌گیری تولیدی", () => {
  it("اسکریپت پشتیبان‌گیری، dump + checksum + نشانگر + ردیف ممیزی می‌سازد", async () => {
    const result = await run("bash", ["scripts/backup-production.sh"], scriptEnv());
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("[backup] OK");

    const dumps = (await readdir(backupDir)).filter((name) => name.endsWith(".dump"));
    expect(dumps.length).toBe(1);
    expect((await readdir(backupDir)).some((name) => name === `${dumps[0]}.sha256`)).toBe(true);
    expect((await readFile(path.join(backupDir, dumps[0]))).byteLength).toBeGreaterThan(10_000);

    const marker = JSON.parse(await readFile(path.join(markerDir, "last-backup"), "utf8")) as { ok: boolean; file: string; sizeBytes: number; sha256: string; durationMs: number };
    expect(marker.ok).toBe(true);
    expect(marker.file).toBe(path.join(backupDir, dumps[0]));
    expect(marker.sizeBytes).toBeGreaterThan(10_000);
    expect(marker.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(marker.durationMs).toBeGreaterThanOrEqual(0);
    expect(formatBytes(marker.sizeBytes)).toMatch(/(KB|MB)/);

    const [auditRow] = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.action, "production_backup"), eq(s.auditLogs.targetType, "system"))).orderBy(desc(s.auditLogs.createdAt)).limit(1);
    expect(auditRow.detail).toContain(dumps[0]);
    void PSQL;
  }, 60_000);

  it("حالت --verify اسکریپت بازیابی، dump سالم را تأیید می‌کند", async () => {
    const dump = (await readdir(backupDir)).find((name) => name.endsWith(".dump"))!;
    const result = await run("bash", ["scripts/restore-production.sh", path.join(backupDir, dump), "--verify"], scriptEnv());
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("VERIFY-OK");
    expect(result.stdout).toContain("checksum OK");
  }, 60_000);

  it("نگهداری محدود نسخه‌ها (BACKUP_KEEP) نسخه‌های قدیمی را حذف می‌کند", async () => {
    for (let index = 0; index < 4; index++) await run("bash", ["scripts/backup-production.sh"], scriptEnv());
    const dumps = (await readdir(backupDir)).filter((name) => name.endsWith(".dump"));
    expect(dumps.length).toBe(3); // BACKUP_KEEP=3
    const checksums = (await readdir(backupDir)).filter((name) => name.endsWith(".sha256"));
    expect(checksums.length).toBe(3);
  }, 120_000);
});
