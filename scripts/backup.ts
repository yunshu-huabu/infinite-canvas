import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Database } from "bun:sqlite";

export async function createBackup(options: { databasePath: string; backupDir: string; retentionDays?: number }) {
    const retentionDays = options.retentionDays ?? 30;
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const backupPath = join(options.backupDir, `infinite-canvas-${stamp}.sqlite`);

    await mkdir(options.backupDir, { recursive: true });
    const database = new Database(options.databasePath, { readonly: true });
    try {
        const escapedPath = backupPath.replaceAll("'", "''");
        database.exec(`VACUUM INTO '${escapedPath}'`);
    } finally {
        database.close();
    }

    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const entry of await readdir(options.backupDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.startsWith("infinite-canvas-") || !entry.name.endsWith(".sqlite")) continue;
        const path = join(options.backupDir, entry.name);
        if (Bun.file(path).lastModified < cutoff) await rm(path);
    }
    return backupPath;
}

if (import.meta.main) {
    const dataDir = resolve(process.env.DATA_DIR || "data");
    const databasePath = resolve(process.env.DATABASE_PATH || join(dataDir, "infinite-canvas.sqlite"));
    const backupPath = await createBackup({
        databasePath,
        backupDir: resolve(process.env.BACKUP_DIR || "backups"),
        retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 30),
    });
    console.log(`Backup created: ${basename(backupPath)}`);
}
