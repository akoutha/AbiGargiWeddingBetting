import { NextResponse, type NextRequest } from "next/server";
import { grantAccess } from "@/lib/auth/session";

/** The QR code opens /join/link?code=..., which keeps the code out of the address bar. */
export async function GET(request: NextRequest) {
  await grantAccess(request.nextUrl.searchParams.get("code") ?? "");
  return NextResponse.redirect(new URL("/join", request.url));
}
