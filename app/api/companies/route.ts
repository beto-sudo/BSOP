// app/api/companies/route.ts
import { NextResponse } from "next/server";
import { listCompanies } from "@/lib/repos/companyRepo";

export const revalidate = 0;

export async function GET() {
  try {
    const companies = await listCompanies();
    return NextResponse.json(companies);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
