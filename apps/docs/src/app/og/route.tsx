import { renderOgImage } from "./og-image";

export async function GET() {
  return renderOgImage("Record scripted browser\ndemos as video.");
}
