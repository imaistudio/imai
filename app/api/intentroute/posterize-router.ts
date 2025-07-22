import { NextRequest, NextResponse } from "next/server";

export async function handlePosterizeRequest(
  formData: FormData,
): Promise<NextResponse> {
  console.log("🎨 POSTERIZE ROUTER: Processing direct posterize request");

  try {
    const userid = formData.get("userid") as string;
    const imageUrl = formData.get("image_url") as string || formData.get("product_image_url") as string;

    // Validate required parameters
    if (!userid) {
      return NextResponse.json({
        status: "error",
        error: "Missing userid parameter",
      }, { status: 400 });
    }

    if (!imageUrl) {
      return NextResponse.json({
        status: "error", 
        error: "Missing image_url parameter for posterize",
      }, { status: 400 });
    }

    console.log(`🎨 Posterizing image: ${imageUrl}`);

    // Get the base URL for the API call
    const getBaseUrl = (): string => {
      if (process.env.NODE_ENV === "development") {
        return "http://localhost:3000";
      }
      if (process.env.NEXT_PUBLIC_BASE_URL) {
        return process.env.NEXT_PUBLIC_BASE_URL;
      }
      if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
      }
      return "https://imai.studio";
    };

    // Prepare the request for the posterize API
    const posterizeFormData = new FormData();

    // Copy all existing form data
    formData.forEach((value, key) => {
      posterizeFormData.append(key, value);
    });

    // Ensure image_url is set
    posterizeFormData.set("image_url", imageUrl);

    // Add default posterize parameters if not provided
    if (!posterizeFormData.get("style")) {
      posterizeFormData.set("style", "modern");
    }
    if (!posterizeFormData.get("theme")) {
      posterizeFormData.set("theme", "professional");
    }
    if (!posterizeFormData.get("quality")) {
      posterizeFormData.set("quality", "high");
    }

    // Import and call the posterize API logic directly
    const { POST: posterizePOST } = await import("../posterize/route");

    const mockRequest = new Request(`${getBaseUrl()}/api/posterize`, {
      method: "POST",
      body: posterizeFormData,
    });

    const response = await posterizePOST(mockRequest as any);
    const result = await response.json();

    console.log("✅ Posterize execution completed successfully");

    // Return standardized response
    return NextResponse.json({
      status: result.status || "success",
      message: result.message || "Image posterized successfully! 🎨",
      result: result,
      images: result.imageUrl ? [result.imageUrl] : [],
      intent: {
        intent: "posterize_image",
        endpoint: "/api/posterize", 
        parameters: {},
        confidence: 1.0,
        explanation: "Direct posterize execution",
      },
      conversation_id: `${userid}_${Date.now()}`,
    });
  } catch (error: any) {
    console.error(`❌ Posterize routing error:`, error);
    return NextResponse.json({
      status: "error",
      error: `Posterize routing failed: ${error.message || error}`,
    }, { status: 500 });
  }
} 