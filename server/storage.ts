// Local filesystem storage — replaces the old Forge storage proxy
import fs from "fs/promises";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR || "/app/uploads";
const BASE_URL = process.env.STORAGE_BASE_URL || "";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(STORAGE_DIR, key);

  await ensureDir(path.dirname(filePath));

  if (typeof data === "string") {
    await fs.writeFile(filePath, data, "utf-8");
  } else {
    await fs.writeFile(filePath, data);
  }

  const url = `${BASE_URL}/uploads/${key}`;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: `${BASE_URL}/uploads/${key}`,
  };
}
