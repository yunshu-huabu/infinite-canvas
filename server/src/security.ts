import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadEncryptionKey(path: string, provided?: string) {
    if (provided) return createHash("sha256").update(provided).digest();
    if (existsSync(path)) return Buffer.from(readFileSync(path, "utf8").trim(), "base64");
    mkdirSync(dirname(path), { recursive: true });
    const key = randomBytes(32);
    writeFileSync(path, key.toString("base64"), { mode: 0o600 });
    try {
        chmodSync(path, 0o600);
    } catch {
        // Windows and some mounted filesystems do not support POSIX modes.
    }
    return key;
}

export function encryptJson(value: unknown, key: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptJson<T>(value: string, key: Buffer): T {
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("无法读取加密配置");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as T;
}

export function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32) {
    return randomBytes(bytes).toString("base64url");
}
