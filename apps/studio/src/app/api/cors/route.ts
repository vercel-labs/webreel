import { NextRequest, NextResponse } from "next/server";
import { isBlockedUrl } from "@/lib/url-validation";

const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "origin",
  "referer",
  "cookie",
  "authorization",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "set-cookie",
  "transfer-encoding",
]);

function resolveUrl(raw: string, base?: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!base) return raw;
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

function rewriteCssUrls(css: string, baseUrl: string): string {
  return css.replace(/url\(\s*(['"]?)(\/?[^)'"]+)\1\s*\)/g, (_match, quote, rawUrl) => {
    if (rawUrl.startsWith("data:") || rawUrl.startsWith("#")) return _match;
    const absolute = resolveUrl(rawUrl, baseUrl);
    if (!/^https?:\/\//i.test(absolute)) return _match;
    return `url(${quote}/api/cors?url=${encodeURIComponent(absolute)}${quote})`;
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (isBlockedUrl(url)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
    };

    for (const [key, value] of request.headers.entries()) {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    const contentType = response.headers.get("content-type") || "";
    const responseHeaders = new Headers();

    for (const [key, value] of response.headers.entries()) {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    if (contentType.includes("text/css")) {
      const css = await response.text();
      const baseUrl = url.replace(/[?#].*$/, "").replace(/\/[^/]*$/, "/");
      const rewritten = rewriteCssUrls(css, baseUrl);
      responseHeaders.set("Content-Type", contentType);
      return new NextResponse(rewritten, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    responseHeaders.delete("content-encoding");

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
