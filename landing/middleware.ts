import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const betaCookieName = "crewtools_beta";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/beta")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/beta/login") {
    return NextResponse.next();
  }

  const token = process.env.BETA_ACCESS_TOKEN;
  const cookieValue = request.cookies.get(betaCookieName)?.value;

  if (!token || cookieValue !== token) {
    return NextResponse.redirect(new URL("/beta/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/beta/:path*"],
};
