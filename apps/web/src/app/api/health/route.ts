import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "usdcare-web",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
