import { NextRequest, NextResponse } from "next/server";

// App-level gate: when DASHBOARD_PASSWORD is set (Vercel prod), require
// HTTP Basic Auth (user: rob). Unset locally → no gate, zero friction.
// Real allowlist auth lands in Phase 1; this keeps deal data off the open web today.

// Twilio must reach these unauthenticated; they carry their own
// X-Twilio-Signature auth and never return graph data.
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/api/twilio/voice" || pathname.startsWith("/api/webhooks/")
  );
}

export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [user, pass] = atob(header.slice(6)).split(":");
    if (user === "rob" && pass === password) return NextResponse.next();
  }
  return new NextResponse("The Network — authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="The Network"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
