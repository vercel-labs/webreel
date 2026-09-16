#!/usr/bin/env node
/* global console, process */

import {
  existsSync,
  mkdirSync,
  chmodSync,
  createWriteStream,
  unlinkSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { platform, arch } from "os";
import { get } from "https";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const binDir = join(projectRoot, "bin");

function isMusl() {
  if (platform() !== "linux") return false;
  try {
    const result = execSync("ldd --version 2>&1 || true", {
      encoding: "utf8",
    });
    return result.toLowerCase().includes("musl");
  } catch {
    return (
      existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1")
    );
  }
}

const osKey = platform() === "linux" && isMusl() ? "linux-musl" : platform();
const platformKey = `${osKey}-${arch()}`;
const ext = platform() === "win32" ? ".exe" : "";
const binaryName = `webreel-${platformKey}${ext}`;
const binaryPath = join(binDir, binaryName);

const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version;

const GITHUB_REPO = "vercel-labs/webreel";
const DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${binaryName}`;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);

    const request = (reqUrl) => {
      get(reqUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }).on("error", (err) => {
        try {
          unlinkSync(dest);
        } catch {
          // cleanup best-effort
        }
        reject(err);
      });
    };

    request(url);
  });
}

function writeInstallMethod() {
  const ua = process.env.npm_config_user_agent || "";
  let method = "";
  if (ua.startsWith("pnpm/")) method = "pnpm";
  else if (ua.startsWith("yarn/")) method = "yarn";
  else if (ua.startsWith("bun/")) method = "bun";
  else if (ua.startsWith("npm/")) method = "npm";

  if (method) {
    try {
      writeFileSync(join(binDir, ".install-method"), method);
    } catch {
      // non-critical metadata
    }
  }
}

async function fixGlobalInstallBin() {
  if (platform() === "win32") {
    await fixWindowsShims();
  } else {
    await fixUnixSymlink();
  }
}

async function fixUnixSymlink() {
  let npmBinDir;
  try {
    const prefix = execSync("npm prefix -g", { encoding: "utf8" }).trim();
    npmBinDir = join(prefix, "bin");
  } catch {
    return;
  }

  const symlinkPath = join(npmBinDir, "webreel");

  try {
    const stat = lstatSync(symlinkPath);
    if (!stat.isSymbolicLink()) return;
  } catch {
    return;
  }

  try {
    unlinkSync(symlinkPath);
    symlinkSync(binaryPath, symlinkPath);
    console.log("Optimized: symlink points to native binary (zero overhead)");
  } catch (err) {
    console.log(`Could not optimize symlink: ${err.message}`);
    console.log("  CLI will work via Node.js wrapper (slightly slower startup)");
  }
}

async function fixWindowsShims() {
  let npmBinDir;
  try {
    npmBinDir = execSync("npm prefix -g", { encoding: "utf8" }).trim();
  } catch {
    return;
  }

  const cmdShim = join(npmBinDir, "webreel.cmd");
  const ps1Shim = join(npmBinDir, "webreel.ps1");

  if (!existsSync(cmdShim)) return;

  const cpuArch = arch() === "arm64" ? "arm64" : "x64";
  const relativeBinaryPath = `node_modules\\webreel\\bin\\webreel-win32-${cpuArch}.exe`;
  const absoluteBinaryPath = join(npmBinDir, relativeBinaryPath);

  if (!existsSync(absoluteBinaryPath)) return;

  try {
    const cmdContent = `@ECHO off\r\n"%~dp0${relativeBinaryPath}" %*\r\n`;
    writeFileSync(cmdShim, cmdContent);

    const ps1Content = `#!/usr/bin/env pwsh\r\n$basedir = Split-Path $MyInvocation.MyCommand.Definition -Parent\r\n& "$basedir\\${relativeBinaryPath}" $args\r\nexit $LASTEXITCODE\r\n`;
    writeFileSync(ps1Shim, ps1Content);

    console.log("Optimized: shims point to native binary (zero overhead)");
  } catch (err) {
    console.log(`Could not optimize shims: ${err.message}`);
    console.log("  CLI will work via Node.js wrapper (slightly slower startup)");
  }
}

async function main() {
  if (existsSync(binaryPath)) {
    if (platform() !== "win32") {
      chmodSync(binaryPath, 0o755);
    }
    console.log(`Native binary ready: ${binaryName}`);
    writeInstallMethod();
    await fixGlobalInstallBin();
    return;
  }

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  console.log(`Downloading native binary for ${platformKey}...`);
  console.log(`URL: ${DOWNLOAD_URL}`);

  try {
    await downloadFile(DOWNLOAD_URL, binaryPath);

    if (platform() !== "win32") {
      chmodSync(binaryPath, 0o755);
    }

    console.log(`Downloaded native binary: ${binaryName}`);
  } catch (err) {
    console.log(`Could not download native binary: ${err.message}`);
    console.log("");
    console.log("To build the native binary locally:");
    console.log("  1. Install Zig: https://ziglang.org/download/");
    console.log(
      "  2. Run: cd packages/@webreel/compositor && zig build -Doptimize=ReleaseFast -Dexe-name=webreel",
    );
    console.log("");
    console.log("Or install the standalone binary:");
    console.log("  curl -fsSL https://webreel.dev/install | sh");
  }

  writeInstallMethod();
  await fixGlobalInstallBin();
}

main().catch(console.error);
