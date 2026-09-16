import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { createBackup } from "./backup";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("database backups", () => {
    test("creates a consistent SQLite snapshot", async () => {
        const root = join(process.cwd(), `.test-backup-${crypto.randomUUID()}`);
        roots.push(root);
        mkdirSync(root, { recursive: true });
        const source = join(root, "source.sqlite");
        const database = new Database(source);
        database.exec("CREATE TABLE items (value TEXT); INSERT INTO items VALUES ('ok');");
        database.close();
        const backup = await createBackup({ databasePath: source, backupDir: join(root, "backups") });
        const restored = new Database(backup, { readonly: true });
        expect(restored.query("SELECT value FROM items").get()).toEqual({ value: "ok" });
        restored.close();
    });
});
