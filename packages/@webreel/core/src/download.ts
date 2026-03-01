import { createWriteStream, mkdirSync, unlinkSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw new Error(
    `${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message ?? "unknown error"}`,
    {
      cause: lastError,
    },
  );
}

export async function fetchJson(url: string): Promise<unknown> {
  const res = await withRetry(async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r;
  }, `Fetch ${url}`);
  return res.json();
}

export async function downloadFile(
  url: string,
  destPath: string,
  label: string,
): Promise<void> {
  console.log(`Downloading ${label}... (one-time setup)`);

  mkdirSync(resolve(destPath, ".."), { recursive: true });

  await withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    if (!res.body) throw new Error(`Empty response body from ${url}`);

    const ws = createWriteStream(destPath);
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      ws,
    );
  }, `Download ${label}`);
}

export function extractArchive(archivePath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });

  if (archivePath.endsWith(".tar.xz")) {
    execFileSync("tar", ["-xf", archivePath, "-C", destDir], { stdio: "pipe" });
  } else if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-Command",
        `Expand-Archive -Force -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}'`,
      ],
      { stdio: "pipe" },
    );
  } else {
    execFileSync("unzip", ["-o", "-q", archivePath, "-d", destDir], {
      stdio: "pipe",
    });
  }
}

export async function downloadAndExtract(
  url: string,
  destDir: string,
  label: string,
): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  const ext = url.endsWith(".tar.xz") ? ".tar.xz" : ".zip";
  const archivePath = resolve(destDir, `_download${ext}`);

  await downloadFile(url, archivePath, label);
  extractArchive(archivePath, destDir);
  unlinkSync(archivePath);
  console.log(`${label} ready.`);
}

export function makeExecutable(path: string): void {
  if (process.platform !== "win32") {
    chmodSync(path, 0o755);
  }
}
