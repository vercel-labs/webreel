import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const VIDEO_NAME_RE = /^[a-zA-Z0-9._-]+$/;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    config: unknown;
    video?: string;
    videos?: string[];
  };

  if (!body.config) {
    return Response.json({ error: "Missing config" }, { status: 400 });
  }

  const allVideos = body.videos ?? (body.video ? [body.video] : []);
  for (const v of allVideos) {
    if (!VIDEO_NAME_RE.test(v)) {
      return Response.json({ error: "Invalid video name" }, { status: 400 });
    }
  }

  const tempDir = join(tmpdir(), "webreel-studio");
  mkdirSync(tempDir, { recursive: true });
  const configPath = join(tempDir, `${randomUUID()}.json`);
  writeFileSync(configPath, JSON.stringify(body.config, null, 2));

  const webreelBin =
    process.env.WEBREEL_BIN ??
    join(process.cwd(), "..", "..", "packages", "webreel", "dist", "index.js");

  const args = ["record"];
  if (allVideos.length > 0) {
    args.push(...allVideos);
  }
  args.push("-c", configPath, "--verbose");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const child = spawn("node", [webreelBin, ...args], {
        cwd: tempDir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      function send(type: string, data: string) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      }

      child.stdout.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          send("stdout", line);
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          send("stderr", line);
        }
      });

      child.on("close", (code) => {
        send("exit", String(code ?? 0));
        try {
          unlinkSync(configPath);
        } catch {}
        controller.close();
      });

      child.on("error", (err) => {
        send("error", err.message);
        try {
          unlinkSync(configPath);
        } catch {}
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
