import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export { getPageTitle } from "@/lib/page-titles";

interface FontData {
  geistRegular: Buffer | null;
  geistPixelSquare: Buffer | null;
}

let fontCache: FontData | null = null;

async function loadFont(path: string): Promise<Buffer | null> {
  if (!existsSync(path)) return null;
  return readFile(path);
}

async function loadFonts(): Promise<FontData> {
  if (fontCache) return fontCache;
  const [geistRegular, geistPixelSquare] = await Promise.all([
    loadFont(join(process.cwd(), "public/Geist-Regular.ttf")),
    loadFont(join(process.cwd(), "public/GeistPixel-Square.ttf")),
  ]);
  fontCache = { geistRegular, geistPixelSquare };
  return fontCache;
}

export async function renderOgImage(title: string) {
  const { geistRegular, geistPixelSquare } = await loadFonts();

  const fonts: {
    name: string;
    data: ArrayBuffer;
    style: "normal" | "italic";
    weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  }[] = [];
  if (geistRegular) {
    fonts.push({
      name: "Geist",
      data: new Uint8Array(geistRegular).buffer as ArrayBuffer,
      style: "normal",
      weight: 400,
    });
  }
  if (geistPixelSquare) {
    fonts.push({
      name: "Geist Pixel Square",
      data: new Uint8Array(geistPixelSquare).buffer as ArrayBuffer,
      style: "normal",
      weight: 500,
    });
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "black",
        padding: "60px 80px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 16 16" fill="white">
          <path fillRule="evenodd" clipRule="evenodd" d="M8 1L16 15H0L8 1Z" />
        </svg>
        <span
          style={{
            fontSize: 36,
            color: "#666",
            fontFamily: "Geist",
            fontWeight: 400,
          }}
        >
          /
        </span>
        <span
          style={{
            fontSize: 36,
            fontFamily: "Geist Pixel Square",
            fontWeight: 500,
            color: "white",
          }}
        >
          webreel
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {title.split("\n").map((line, i) => (
          <span
            key={i}
            style={{
              fontSize: 72,
              fontFamily: "Geist",
              fontWeight: 400,
              color: "white",
              letterSpacing: "-0.02em",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {line}
          </span>
        ))}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
