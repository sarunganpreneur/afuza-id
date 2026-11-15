import { documentHtml } from "./document";

// Serve a complete document so Afuza's app layout and styles do not alter
// the reference portal's typography, navigation, or responsive layout.
export const dynamic = "force-static";

export function GET() {
  return new Response(documentHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
