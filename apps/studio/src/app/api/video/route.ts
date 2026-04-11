import { NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".gif": "image/gif",
};

const ALLOWED_ROOTS = [
  resolve(tmpdir(), "webreel-studio"),
  resolve(process.cwd(), "output"),
];

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  const resolved = resolve(path);
  const allowed = ALLOWED_ROOTS.some((root) => resolved.startsWith(root + "/"));
  if (!allowed) {
    return Response.json({ error: "Forbidden path" }, { status: 403 });
  }

  try {
    const stats = await stat(resolved);
    if (!stats.isFile()) {
      return Response.json({ error: "Not a file" }, { status: 404 });
    }

    const data = await readFile(resolved);
    const ext = extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${resolved.split("/").pop()}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 });
  }
}
