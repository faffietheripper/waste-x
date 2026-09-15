import { handleClientDiagnosticPost } from "@/lib/client-api/diagnostics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleClientDiagnosticPost(request, {
    deviceType: "MOBILE",
    surface: "MOBILE",
  });
}
