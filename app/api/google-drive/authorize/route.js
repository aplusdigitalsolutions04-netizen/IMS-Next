import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/googleDrive";

export async function GET() {
  try {
    return NextResponse.redirect(getAuthUrl());
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
