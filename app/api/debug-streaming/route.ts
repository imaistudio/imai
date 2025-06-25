import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Debug endpoint working",
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log("🔍 Debug endpoint called");
    console.log("Headers:", Object.fromEntries(request.headers.entries()));

    const contentType = request.headers.get("content-type") || "";
    console.log("Content-Type:", contentType);

    let body;
    if (contentType.includes("application/json")) {
      body = await request.json();
      console.log("JSON body:", body);
    } else {
      const text = await request.text();
      console.log("Text body:", text);
      body = { rawText: text };
    }

    return NextResponse.json({
      status: "success",
      receivedContentType: contentType,
      receivedBody: body,
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries(request.headers.entries()),
    });
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
