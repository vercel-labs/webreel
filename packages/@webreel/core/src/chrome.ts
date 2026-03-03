import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fetchJson, downloadAndExtract } from "./download.js";

const CfT_MANIFEST_URL =
  "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

type CfTManifest = {
  channels: {
    Stable: {
      downloads: {
        chrome: Array<{ platform: string; url: string }>;
        "chrome-headless-shell": Array<{ platform: string; url: string }>;
      };
    };
  };
};

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

export function cftPlatform(): string {
  const { platform, arch } = process;
  if (platform === "darwin" && arch === "arm64") return "mac-arm64";
  if (platform === "darwin") return "mac-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "linux") return "linux64";
  if (platform === "win32") return "win64";
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

function cftExecutablePath(cacheDir: string): string | null {
  const { platform } = process;
  if (platform === "darwin") {
    const entries = readdirSync(cacheDir).filter((e) => e.startsWith("chrome-mac"));
    for (const dir of entries) {
      const p = resolve(
        cacheDir,
        dir,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing",
      );
      if (existsSync(p)) return p;
    }
  } else if (platform === "linux") {
    const entries = readdirSync(cacheDir).filter((e) => e.startsWith("chrome-linux"));
    for (const dir of entries) {
      const p = resolve(cacheDir, dir, "chrome");
      if (existsSync(p)) return p;
    }
  } else if (platform === "win32") {
    const entries = readdirSync(cacheDir).filter((e) => e.startsWith("chrome-win"));
    for (const dir of entries) {
      const p = resolve(cacheDir, dir, "chrome.exe");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function headlessShellPath(cacheDir: string): string | null {
  const { platform } = process;
  const prefix = "chrome-headless-shell-";
  try {
    const entries = readdirSync(cacheDir).filter((e) => e.startsWith(prefix));
    for (const dir of entries) {
      const name =
        platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
      const p = resolve(cacheDir, dir, name);
      if (existsSync(p)) return p;
    }
  } catch (err) {
    console.warn("Failed to scan headless shell cache:", err);
    return null;
  }
  return null;
}

function findChrome(): string {
  const candidates = CHROME_PATHS[process.platform] ?? [];
  for (const p of candidates) {
    if (p.includes("/") || p.includes("\\")) {
      if (existsSync(p)) return p;
    } else {
      return p;
    }
  }
  throw new Error(
    `Could not find Chrome. Install Google Chrome or set CHROME_PATH env var.`,
  );
}

export async function ensureChrome(): Promise<string> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const cacheDir = resolve(homedir(), ".webreel", "bin", "chrome");
  if (existsSync(cacheDir)) {
    const cached = cftExecutablePath(cacheDir);
    if (cached) return cached;
  }

  try {
    const manifest = (await fetchJson(CfT_MANIFEST_URL)) as CfTManifest;
    const platform = cftPlatform();
    const entry = manifest.channels.Stable.downloads.chrome.find(
      (d) => d.platform === platform,
    );
    if (!entry) throw new Error(`No Chrome for Testing build for ${platform}`);

    await downloadAndExtract(entry.url, cacheDir, "Chrome for Testing");

    const exe = cftExecutablePath(cacheDir);
    if (exe) return exe;

    throw new Error("Downloaded Chrome but could not locate executable");
  } catch (err) {
    try {
      return findChrome();
    } catch (findErr) {
      throw new Error(
        `Failed to download Chrome and no system Chrome found: ${err instanceof Error ? err.message : String(err)}`,
        { cause: findErr },
      );
    }
  }
}

export async function ensureHeadlessShell(): Promise<string> {
  const cacheDir = resolve(homedir(), ".webreel", "bin", "chrome-headless-shell");
  if (existsSync(cacheDir)) {
    const cached = headlessShellPath(cacheDir);
    if (cached) return cached;
  }

  const manifest = (await fetchJson(CfT_MANIFEST_URL)) as CfTManifest;
  const platform = cftPlatform();
  const entries = manifest.channels.Stable.downloads["chrome-headless-shell"];
  const entry = entries?.find((d) => d.platform === platform);
  if (!entry) throw new Error(`No chrome-headless-shell build for ${platform}`);

  await downloadAndExtract(entry.url, cacheDir, "chrome-headless-shell");

  const exe = headlessShellPath(cacheDir);
  if (exe) return exe;
  throw new Error("Downloaded chrome-headless-shell but could not locate executable");
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not get port")));
      }
    });
    srv.on("error", reject);
  });
}

export interface ChromeInstance {
  process: ChildProcess;
  port: number;
  kill: () => void;
}

const MAX_LAUNCH_ATTEMPTS = 3;

export interface LaunchChromeOptions {
  headless?: boolean;
}

export async function launchChrome(
  options?: LaunchChromeOptions,
): Promise<ChromeInstance> {
  const headless = options?.headless ?? true;
  const chromePath = headless ? await ensureHeadlessShell() : await ensureChrome();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_LAUNCH_ATTEMPTS; attempt++) {
    const port = await findFreePort();
    const userDataDir = mkdtempSync(join(tmpdir(), "webreel-chrome-"));

    const args = headless
      ? [
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${userDataDir}`,
          "--no-sandbox",
          "--hide-scrollbars",
          "--enable-begin-frame-control",
          "--run-all-compositor-stages-before-draw",
          "--disable-threaded-animation",
          "--disable-threaded-scrolling",
          "--disable-checker-imaging",
          "about:blank",
        ]
      : [
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${userDataDir}`,
          "--no-sandbox",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-sync",
          "--disable-translate",
          "--mute-audio",
          "--hide-scrollbars",
          "about:blank",
        ];

    const proc = spawn(chromePath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Chrome launch timeout")),
          10000,
        );
        const onData = (chunk: Buffer) => {
          if (chunk.toString().includes("DevTools listening on")) {
            clearTimeout(timeout);
            proc.stderr?.off("data", onData);
            resolve();
          }
        };
        proc.stderr?.on("data", onData);
        proc.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        proc.on("exit", (code) => {
          clearTimeout(timeout);
          reject(new Error(`Chrome exited with code ${code}`));
        });
      });

      return {
        process: proc,
        port,
        kill: () => {
          proc.kill("SIGTERM");
          setTimeout(() => {
            rmSync(userDataDir, { recursive: true, force: true });
          }, 500);
        },
      };
    } catch (err) {
      lastError = err as Error;
      proc.kill("SIGKILL");
      rmSync(userDataDir, { recursive: true, force: true });

      if (attempt < MAX_LAUNCH_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  throw lastError ?? new Error("Failed to launch Chrome");
}
