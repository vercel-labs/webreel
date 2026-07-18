import {
  createWriteStream,
  mkdirSync,
  unlinkSync,
  chmodSync,
  realpathSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";

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

/**
 * Throws unless `url` uses https: and its hostname is one of `allowedHosts`.
 * Callers should validate the ORIGINAL url returned by a remote manifest/API
 * response before following it — if fetch() follows a redirect to a
 * different host (e.g. a signed CDN URL), that redirect target is not
 * separately validated here. That's an accepted gap: the original host is
 * the one we trust to hand out download links in the first place.
 */
export function assertTrustedUrl(url: string, allowedHosts: string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to fetch invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `Refusing to fetch non-https URL: ${url} (protocol ${parsed.protocol})`,
    );
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch URL from untrusted host: ${parsed.hostname} (expected one of ${allowedHosts.join(", ")})`,
    );
  }
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
  expectedSha256?: string,
): Promise<void> {
  console.log(`Downloading ${label}... (one-time setup)`);

  mkdirSync(resolve(destPath, ".."), { recursive: true });

  await withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    if (!res.body) throw new Error(`Empty response body from ${url}`);

    const hash = createHash("sha256");
    const ws = createWriteStream(destPath);
    const source = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
    source.on("data", (chunk) => hash.update(chunk));
    await pipeline(source, ws);

    if (expectedSha256) {
      const actual = hash.digest("hex");
      if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
        unlinkSync(destPath);
        throw new Error(
          `Checksum mismatch for ${label}: expected sha256 ${expectedSha256}, got ${actual}. ` +
            `The download may be corrupted or tampered with — retry, or set the corresponding ` +
            `*_PATH env var (e.g. CHROME_PATH / FFMPEG_PATH) to use a local binary instead.`,
        );
      }
    }
  }, `Download ${label}`);
}

/**
 * Parses `tar -tf` output (one bare entry path per line) as well as the
 * plain newline-separated entry listing we generate for zips on Windows.
 */
export function parseTarListing(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parses `unzip -l` output, e.g.:
 *   Archive:  test.zip
 *     Length      Date    Time    Name
 *   ---------  ---------- -----   ----
 *           0  01-01-2020 00:00   folder/
 *          10  01-01-2020 00:00   folder/file.txt
 *   ---------                     -------
 *          10                     2 files
 */
export function parseZipListing(output: string): string[] {
  const entries: string[] = [];
  const entryLineRe = /^\s*\d+\s+\S+\s+\S+\s+(.+?)\s*$/;
  for (const line of output.split("\n")) {
    if (/^Archive:/.test(line)) continue;
    if (/^\s*Length\s+Date\s+Time\s+Name\s*$/.test(line)) continue;
    if (/^-+\s+-+\s+-+\s+-+\s*$/.test(line)) continue;
    if (/^\s*\d+\s+\d+\s+files?\s*$/.test(line)) continue;
    const m = line.match(entryLineRe);
    if (m) entries.push(m[1]);
  }
  return entries;
}

/**
 * True if an archive entry path would escape the extraction directory:
 * an absolute path (unix or Windows-drive-letter form), or a path with a
 * ".." path segment.
 */
export function isUnsafeEntryPath(entryPath: string): boolean {
  if (!entryPath) return false;
  const normalized = entryPath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(entryPath)) return true;
  return normalized.split("/").includes("..");
}

export function validateEntryPaths(paths: string[], archiveLabel = "archive"): void {
  for (const p of paths) {
    if (isUnsafeEntryPath(p)) {
      throw new Error(`Refusing to extract ${archiveLabel}: unsafe entry path "${p}"`);
    }
  }
}

function listArchiveEntries(archivePath: string): string[] {
  if (archivePath.endsWith(".tar.xz")) {
    const out = execFileSync("tar", ["-tf", archivePath], {
      stdio: ["ignore", "pipe", "pipe"],
    }).toString("utf8");
    return parseTarListing(out);
  }
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('${archivePath.replace(/'/g, "''")}'); $zip.Entries | ForEach-Object { $_.FullName }; $zip.Dispose()`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    ).toString("utf8");
    return parseTarListing(out);
  }
  const out = execFileSync("unzip", ["-l", archivePath], {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString("utf8");
  return parseZipListing(out);
}

/**
 * Defense in depth for symlink-based escapes: walks the extracted tree and
 * verifies every entry's realpath stays under destDir's realpath. Removes
 * destDir and throws on violation.
 */
function verifyExtractedWithinDir(destDir: string): void {
  const destReal = realpathSync(destDir);
  const stack: string[] = [destDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = resolve(dir, entry.name);
      let real: string;
      try {
        real = realpathSync(full);
      } catch {
        continue;
      }
      const rel = relative(destReal, real);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        rmSync(destDir, { recursive: true, force: true });
        throw new Error(
          `Refusing extracted archive: entry "${full}" resolves outside destination directory ${destReal}`,
        );
      }
      if (entry.isDirectory()) stack.push(full);
    }
  }
}

export function extractArchive(archivePath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });

  const entries = listArchiveEntries(archivePath);
  validateEntryPaths(entries, archivePath);

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

  verifyExtractedWithinDir(destDir);
}

export async function downloadAndExtract(
  url: string,
  destDir: string,
  label: string,
  expectedSha256?: string,
): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  const ext = url.endsWith(".tar.xz") ? ".tar.xz" : ".zip";
  const archivePath = resolve(destDir, `_download${ext}`);

  await downloadFile(url, archivePath, label, expectedSha256);
  extractArchive(archivePath, destDir);
  unlinkSync(archivePath);
  console.log(`${label} ready.`);
}

export function makeExecutable(path: string): void {
  if (process.platform !== "win32") {
    chmodSync(path, 0o755);
  }
}
