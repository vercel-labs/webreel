export function rewriteHtml(html: string, pageUrl: string): string {
  const parsed = new URL(pageUrl);
  const proto = parsed.protocol.replace(":", "");
  const host = parsed.host;
  const prefix = `/api/p/${proto}/${host}`;

  let result = html;

  result = result
    .replace(/(href|src|action|poster|data)="\/(?!\/|api\/p\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action|poster|data)='\/(?!\/|api\/p\/)/g, `$1='${prefix}/`);

  result = result
    .replace(/(href|src|action|poster|data)="\/\//g, `$1="/api/p/https/`)
    .replace(/(href|src|action|poster|data)='\/\//g, `$1='/api/p/https/`);

  result = result
    .replace(/(href|src|action|poster|data)="https:\/\//g, `$1="/api/p/https/`)
    .replace(/(href|src|action|poster|data)='https:\/\//g, `$1='/api/p/https/`)
    .replace(/(href|src|action|poster|data)="http:\/\//g, `$1="/api/p/http/`)
    .replace(/(href|src|action|poster|data)='http:\/\//g, `$1='/api/p/http/`);

  result = result.replace(
    /(srcset)=(["'])([^"']*?)\2/gi,
    (_m, attr: string, quote: string, value: string) => {
      const rewritten = value
        .split(",")
        .map((entry) => {
          const trimmed = entry.trim();
          const parts = trimmed.split(/\s+/);
          if (parts.length === 0) return entry;
          let url = parts[0];
          if (url.startsWith("//")) {
            url = `/api/p/https/${url.slice(2)}`;
          } else if (/^https?:\/\//.test(url)) {
            url = url
              .replace(/^https:\/\//, "/api/p/https/")
              .replace(/^http:\/\//, "/api/p/http/");
          } else if (url.startsWith("/") && !url.startsWith("/api/p/")) {
            url = `${prefix}${url}`;
          }
          parts[0] = url;
          return parts.join(" ");
        })
        .join(", ");
      return `${attr}=${quote}${rewritten}${quote}`;
    },
  );

  result = result
    .replace(/url\(\s*(['"]?)\/(?!\/|api\/p\/)/g, `url($1${prefix}/`)
    .replace(/url\(\s*(['"]?)\/\//g, `url($1/api/p/https/`)
    .replace(/url\(\s*(['"]?)https:\/\//g, `url($1/api/p/https/`)
    .replace(/url\(\s*(['"]?)http:\/\//g, `url($1/api/p/http/`);

  return result;
}

export function injectScript(html: string, scriptContent: string): string {
  const scriptTag = `<script>${scriptContent}</` + "script>";
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${scriptTag}</body>`);
  }
  return html + scriptTag;
}

export function rewriteCssUrls(css: string, originPrefix: string): string {
  return css
    .replace(/url\(\s*(['"]?)\/(?!\/|api\/p\/)/g, `url($1${originPrefix}/`)
    .replace(/url\(\s*(['"]?)https:\/\//g, `url($1/api/p/https/`)
    .replace(/url\(\s*(['"]?)http:\/\//g, `url($1/api/p/http/`)
    .replace(/url\(\s*(['"]?)\/\//g, `url($1/api/p/https/`);
}

export const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "set-cookie",
  "transfer-encoding",
]);

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
