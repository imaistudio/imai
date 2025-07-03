import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  console.log("🔍 Download API called with URL:", imageUrl);

  if (!imageUrl) {
    console.error("❌ No URL parameter provided");
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  try {
    console.log("📥 Fetching image from:", imageUrl);

    // Fetch the image from the provided URL with proper headers
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "image/*, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    console.log("📊 Response status:", response.status, response.statusText);

    if (!response.ok) {
      console.error(
        "❌ Failed to fetch image:",
        response.status,
        response.statusText,
      );
      return NextResponse.json(
        {
          error: `Failed to fetch image: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    console.log(
      "📦 Image fetched successfully. Size:",
      imageBuffer.byteLength,
      "bytes",
    );
    console.log("📄 Content-Type:", contentType);

    // Extract filename from URL or use default
    let filename = imageUrl.split("/").pop() || `download-${Date.now()}.jpg`;

    // Clean up filename - remove query parameters
    if (filename.includes("?")) {
      filename = filename.split("?")[0];
    }

    // Ensure filename has an extension
    if (!filename.includes(".")) {
      filename += ".jpg";
    }

    console.log("📁 Filename:", filename);

    // Return the image with proper headers for download
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": imageBuffer.byteLength.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("❌ Error downloading image:", error);
    return NextResponse.json(
      {
        error: "Failed to download image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
