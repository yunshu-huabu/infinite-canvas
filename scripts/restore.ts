import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Usage: bun scripts/restore.ts <backup.sqlite>");

const dataDir = resolve(process.env.DATA_DIR || "data");
const databasePath = resolve(process.env.DATABASE_PATH || join(dataDir, "infinite-canvas.sqlite"));
await mkdir(dirname(databasePath), { recursive: true });
await copyFile(resolve(source), databasePath);
console.log(`Database restored to ${databasePath}`);
