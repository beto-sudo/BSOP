import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    msg: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "",
    buildAt: new Date().toISOString(),
  });
}
