import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { SESSION_COOKIE } from "@/lib/constants";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/offline",
  "/manifest.webmanifest",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token && pathname !== "/offline") {
      const secret = process.env.SESSION_SECRET;
      if (secret) {
        try {
          await jwtVerify(token, new TextEncoder().encode(secret));
          if (pathname === "/login" || pathname === "/register") {
            return NextResponse.redirect(new URL("/", request.url));
          }
        } catch {
          /* invalid */
        }
      }
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
