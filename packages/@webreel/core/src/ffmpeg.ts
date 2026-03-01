import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  fetchJson,
  downloadAndExtract,
  downloadFile,
  extractArchive,
  makeExecutable,
} from "./download.js";

// BtbN/FFmpeg-Builds: linked from ffmpeg.org, built via GitHub Actions.
// Covers Linux (x64, arm64) and Windows (x64).
const BTBN_BASE = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";

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
const EVERMEET_API = "https://evermeet.cx/ffmpeg/info/ffmpeg/release";

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
  await downloadAndExtract(url, cacheDir, "ffmpeg");

  const bin = binaryName();
  const found = findBinaryInDir(cacheDir, bin);
  if (found) {
    makeExecutable(found);
    return found;
  }
  throw new Error("Downloaded ffmpeg but could not locate binary");
}

async function downloadEvermeet(cacheDir: string): Promise<string> {
  const info = (await fetchJson(EVERMEET_API)) as {
    download: { zip: { url: string } };
  };
  const url = info.download.zip.url;
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

  const cacheDir = resolve(homedir(), ".webreel", "bin", "ffmpeg");
  const bin = findBinaryInDir(cacheDir, binaryName());
  if (bin) return bin;

  try {
    if (process.platform === "darwin") {
      return await downloadEvermeet(cacheDir);
    }
    return await downloadBtbn(cacheDir);
  } catch (err) {
    const sys = systemFfmpeg();
    if (sys) return sys;
    throw new Error(
      `Failed to download ffmpeg and no system ffmpeg found: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
