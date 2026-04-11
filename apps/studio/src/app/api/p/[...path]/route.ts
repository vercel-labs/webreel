import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_SCRIPT } from "@/lib/preview-script";
import {
  rewriteHtml,
  rewriteCssUrls,
  injectScript,
  STRIPPED_RESPONSE_HEADERS,
  DEFAULT_USER_AGENT,
} from "@/lib/proxy-utils";
import { isBlockedUrl } from "@/lib/url-validation";

function reconstructUrl(pathSegments: string[]): string | null {
  if (pathSegments.length < 2) return null;
  const protocol = pathSegments[0];
  if (protocol !== "https" && protocol !== "http") return null;
  const rest = pathSegments.slice(1).join("/");
  return `${protocol}://${rest}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;
  const targetUrl = reconstructUrl(pathSegments);
  if (!targetUrl) {
    return NextResponse.json({ error: "Invalid proxy path" }, { status: 400 });
  }

  const searchParams = request.nextUrl.search;
  const fullUrl = searchParams ? `${targetUrl}${searchParams}` : targetUrl;

  if (isBlockedUrl(fullUrl)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(fullUrl, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: request.headers.get("accept") ?? "*/*",
        "Accept-Language": request.headers.get("accept-language") ?? "en-US,en;q=0.9",
      },
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
    responseHeaders.delete("content-encoding");

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      let html = await response.text();
      const finalUrl = response.url || fullUrl;
      html = rewriteHtml(html, finalUrl);
      html = injectScript(html, PREVIEW_SCRIPT);
      responseHeaders.set("Content-Type", "text/html; charset=utf-8");
      return new NextResponse(html, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    if (contentType.includes("text/css")) {
      const css = await response.text();
      const url = new URL(fullUrl);
      const originPrefix = `/api/p/${url.protocol.replace(":", "")}/${url.host}`;
      const rewritten = rewriteCssUrls(css, originPrefix);
      responseHeaders.set("Content-Type", contentType);
      return new NextResponse(rewritten, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
