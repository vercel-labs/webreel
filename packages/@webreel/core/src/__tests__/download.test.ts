import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  downloadFile,
  assertTrustedUrl,
  isUnsafeEntryPath,
  validateEntryPaths,
  parseZipListing,
  parseTarListing,
  findSha256ForFile,
} from "../download.js";

describe("assertTrustedUrl", () => {
  const allowed = ["example.com", "cdn.example.com"];

  it("accepts an https URL on an allowlisted host", () => {
    expect(() => assertTrustedUrl("https://example.com/file.zip", allowed)).not.toThrow();
    expect(() =>
      assertTrustedUrl("https://cdn.example.com/path/file.zip", allowed),
    ).not.toThrow();
  });

  it("rejects http (non-https) URLs", () => {
    expect(() => assertTrustedUrl("http://example.com/file.zip", allowed)).toThrow(
      /non-https/,
    );
  });

  it("rejects URLs on hosts not in the allowlist", () => {
    expect(() => assertTrustedUrl("https://evil.example.net/file.zip", allowed)).toThrow(
      /untrusted host/,
    );
  });

  it("rejects malformed URLs", () => {
    expect(() => assertTrustedUrl("not a url", allowed)).toThrow();
  });
});

describe("downloadFile", () => {
  let server: Server;
  let port: number;
  const payload = Buffer.from("hello world, this is the download payload");
  const correctSha256 = createHash("sha256").update(payload).digest("hex");

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(payload);
    });
    await new Promise<void>((resolvePromise) => {
      server.listen(0, "127.0.0.1", () => resolvePromise());
    });
    const addr = server.address();
    if (addr && typeof addr === "object") port = addr.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  });

  function destPathFor(name: string): string {
    const dir = resolve(tmpdir(), `webreel-download-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    return resolve(dir, name);
  }

  it("downloads successfully when no digest is provided", async () => {
    const dest = destPathFor("no-digest.bin");
    await downloadFile(`http://127.0.0.1:${port}/file`, dest, "test file");
    expect(existsSync(dest)).toBe(true);
    rmSync(resolve(dest, ".."), { recursive: true, force: true });
  });

  it("downloads successfully when the digest matches", async () => {
    const dest = destPathFor("match.bin");
    await downloadFile(`http://127.0.0.1:${port}/file`, dest, "test file", correctSha256);
    expect(existsSync(dest)).toBe(true);
    rmSync(resolve(dest, ".."), { recursive: true, force: true });
  });

  it("rejects on digest mismatch and deletes the partial file", async () => {
    const dest = destPathFor("mismatch.bin");
    const wrongSha256 = "0".repeat(64);
    await expect(
      downloadFile(`http://127.0.0.1:${port}/file`, dest, "test file", wrongSha256),
    ).rejects.toThrow(/Checksum mismatch/);
    expect(existsSync(dest)).toBe(false);
    rmSync(resolve(dest, ".."), { recursive: true, force: true });
  });
});

describe("isUnsafeEntryPath", () => {
  it("flags absolute unix paths", () => {
    expect(isUnsafeEntryPath("/abs/path")).toBe(true);
    expect(isUnsafeEntryPath("/etc/passwd")).toBe(true);
  });

  it("flags absolute Windows drive paths", () => {
    expect(isUnsafeEntryPath("C:\\Windows\\System32")).toBe(true);
    expect(isUnsafeEntryPath("C:/Windows/System32")).toBe(true);
  });

  it("flags paths containing a .. segment", () => {
    expect(isUnsafeEntryPath("../evil")).toBe(true);
    expect(isUnsafeEntryPath("safe/../../evil")).toBe(true);
    expect(isUnsafeEntryPath("a/../../b")).toBe(true);
  });

  it("allows normal relative paths", () => {
    expect(isUnsafeEntryPath("folder/file.txt")).toBe(false);
    expect(isUnsafeEntryPath("chrome-linux64/chrome")).toBe(false);
    expect(isUnsafeEntryPath("")).toBe(false);
  });
});

describe("validateEntryPaths", () => {
  it("throws when a listing contains a ../ traversal entry", () => {
    expect(() => validateEntryPaths(["safe/file.txt", "../evil"])).toThrow(
      /unsafe entry path/,
    );
  });

  it("throws when a listing contains an absolute path entry", () => {
    expect(() => validateEntryPaths(["safe/file.txt", "/abs/path"])).toThrow(
      /unsafe entry path/,
    );
  });

  it("does not throw for an all-safe listing", () => {
    expect(() =>
      validateEntryPaths(["chrome-linux64/", "chrome-linux64/chrome"]),
    ).not.toThrow();
  });
});

describe("parseZipListing", () => {
  it("extracts entry names from unzip -l output", () => {
    const output = [
      "Archive:  test.zip",
      "  Length      Date    Time    Name",
      "---------  ---------- -----   ----",
      "        0  01-01-2020 00:00   folder/",
      "       10  01-01-2020 00:00   folder/file.txt",
      "---------                     -------",
      "       10                     2 files",
    ].join("\n");
    expect(parseZipListing(output)).toEqual(["folder/", "folder/file.txt"]);
  });

  it("extracts a malicious traversal entry so it can be rejected", () => {
    const output = [
      "Archive:  evil.zip",
      "  Length      Date    Time    Name",
      "---------  ---------- -----   ----",
      "        6  01-01-2020 00:00   ../../evil.txt",
      "        2  01-01-2020 00:00   normal.txt",
      "---------                     -------",
      "        8                     2 files",
    ].join("\n");
    const entries = parseZipListing(output);
    expect(entries).toContain("../../evil.txt");
    expect(() => validateEntryPaths(entries, "evil.zip")).toThrow(/unsafe entry path/);
  });
});

describe("parseTarListing", () => {
  it("returns one trimmed entry per non-empty line", () => {
    const output = "folder/\nfolder/file.txt\n\n";
    expect(parseTarListing(output)).toEqual(["folder/", "folder/file.txt"]);
  });

  it("surfaces traversal entries from tar -tf output", () => {
    const output = "normal.txt\n../../evil.txt\n";
    const entries = parseTarListing(output);
    expect(entries).toContain("../../evil.txt");
    expect(() => validateEntryPaths(entries, "evil.tar.xz")).toThrow(/unsafe entry path/);
  });
});

describe("findSha256ForFile", () => {
  const checksums = [
    "8383958c8f6b1b4eabc40c268ad17aa6a81f331bce58286bb7c8ae416341b722  ffmpeg-linux64.tar.xz",
    "d58bf2c57f4ab59a5c7523b3d03e7380259943640b01a827156e80000124ea63  ffmpeg-win64.zip",
  ].join("\n");

  it("finds the digest for the matching filename", () => {
    expect(findSha256ForFile(checksums, "ffmpeg-linux64.tar.xz")).toBe(
      "8383958c8f6b1b4eabc40c268ad17aa6a81f331bce58286bb7c8ae416341b722",
    );
  });

  it("returns null when the filename is not present", () => {
    expect(findSha256ForFile(checksums, "does-not-exist.zip")).toBeNull();
  });
});
