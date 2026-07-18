import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  fetchJson,
  fetchText,
  findSha256ForFile,
  downloadAndExtract,
  downloadFile,
  extractArchive,
  makeExecutable,
  assertTrustedUrl,
} from "./download.js";

export const FFMPEG_CACHE_DIR = resolve(homedir(), ".webreel", "bin", "ffmpeg");

// BtbN/FFmpeg-Builds: linked from ffmpeg.org, built via GitHub Actions.
// Covers Linux (x64, arm64) and Windows (x64).
const BTBN_BASE = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";
// The initial request goes to github.com, which redirects to a signed
// release-assets.githubusercontent.com URL; only the original github.com
// URL is validated here (see assertTrustedUrl doc comment in download.ts).
const BTBN_HOSTS = ["github.com"];
// The "latest" release tag is a rolling pointer (the underlying build is
// republished under the same tag/filenames), but it publishes a
// checksums.sha256 asset alongside the binaries on every publish, keyed by
// the exact filenames this module downloads — verified against the live
// release. We fetch it from the same release at request time so the
// checksum always matches whatever asset is currently live, without having
// to pin to a versioned release tag (which uses different filenames).
const BTBN_CHECKSUMS_URL = `${BTBN_BASE}/checksums.sha256`;

export function btbnAssetName(): string | null {
  const { platform, arch } = process;
  if (platform === "linux" && arch === "arm64")
    return "ffmpeg-n7.1-latest-linuxarm64-gpl-7.1.tar.xz";
  if (platform === "linux") return "ffmpeg-n7.1-latest-linux64-gpl-7.1.tar.xz";
  if (platform === "win32") return "ffmpeg-n7.1-latest-win64-gpl-7.1.zip";
  return null;
}

// evermeet.cx: linked from ffmpeg.org, macOS x64 static builds.
// Runs on ARM64 Macs via Rosetta 2.
// The API response has no sha256/digest field (only a GPG .sig detached
// signature URL, which we don't currently verify) — confirmed against the
// live endpoint. Integrity for this path rests on HTTPS + host allowlisting
// only; this is a known, accepted gap (see plan 010).
const EVERMEET_API = "https://evermeet.cx/ffmpeg/info/ffmpeg/release";
const EVERMEET_HOSTS = ["evermeet.cx"];

export function binaryName(): string {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

function systemFfmpeg(): string | null {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return "ffmpeg";
  } catch {
    return null;
  }
}

export function findBinaryInDir(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  const direct = resolve(dir, name);
  if (existsSync(direct)) return direct;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const binPath = resolve(dir, entry.name, "bin", name);
        if (existsSync(binPath)) return binPath;
        const flat = resolve(dir, entry.name, name);
        if (existsSync(flat)) return flat;
      }
    }
  } catch (err) {
    console.warn(`Failed to scan directory ${dir} for ${name}:`, err);
    return null;
  }
  return null;
}

async function downloadBtbn(cacheDir: string): Promise<string> {
  const asset = btbnAssetName();
  if (!asset) throw new Error("No BtbN build for this platform");

  const url = `${BTBN_BASE}/${asset}`;
  assertTrustedUrl(url, BTBN_HOSTS);

  let expectedSha256: string | undefined;
  try {
    assertTrustedUrl(BTBN_CHECKSUMS_URL, BTBN_HOSTS);
    const checksums = await fetchText(BTBN_CHECKSUMS_URL);
    expectedSha256 = findSha256ForFile(checksums, asset) ?? undefined;
    if (!expectedSha256) {
      console.warn(
        `No checksum entry for ${asset} in BtbN checksums.sha256; proceeding with URL allowlist only.`,
      );
    }
  } catch (err) {
    console.warn(
      `Failed to fetch BtbN checksums.sha256; proceeding with URL allowlist only: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await downloadAndExtract(url, cacheDir, "ffmpeg", expectedSha256);

  const bin = binaryName();
  const found = findBinaryInDir(cacheDir, bin);
  if (found) {
    makeExecutable(found);
    return found;
  }
  throw new Error("Downloaded ffmpeg but could not locate binary");
}

async function downloadEvermeet(cacheDir: string): Promise<string> {
  assertTrustedUrl(EVERMEET_API, EVERMEET_HOSTS);
  const info = (await fetchJson(EVERMEET_API)) as {
    download: { zip: { url: string } };
  };
  const url = info.download.zip.url;
  assertTrustedUrl(url, EVERMEET_HOSTS);
  const archivePath = resolve(cacheDir, "_download.zip");

  await downloadFile(url, archivePath, "ffmpeg");
  extractArchive(archivePath, cacheDir);
  unlinkSync(archivePath);

  const bin = resolve(cacheDir, "ffmpeg");
  if (existsSync(bin)) {
    makeExecutable(bin);
    return bin;
  }
  throw new Error("Downloaded ffmpeg but could not locate binary");
}

export async function ensureFfmpeg(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const bin = findBinaryInDir(FFMPEG_CACHE_DIR, binaryName());
  if (bin) return bin;

  try {
    if (process.platform === "darwin") {
      return await downloadEvermeet(FFMPEG_CACHE_DIR);
    }
    return await downloadBtbn(FFMPEG_CACHE_DIR);
  } catch (err) {
    const sys = systemFfmpeg();
    if (sys) return sys;
    throw new Error(
      `Failed to download ffmpeg and no system ffmpeg found: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
