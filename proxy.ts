import { NextRequest, NextResponse } from "next/server";

// App-level gate: when DASHBOARD_PASSWORD is set (Vercel prod), require
// HTTP Basic Auth (user: rob). Unset locally → no gate, zero friction.
// Real allowlist auth lands in Phase 1; this keeps deal data off the open web today.
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

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
