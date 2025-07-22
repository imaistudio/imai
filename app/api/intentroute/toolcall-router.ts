import { NextRequest, NextResponse } from "next/server";

// Tool endpoint mapping
const TOOL_ENDPOINTS: Record<string, string> = {
  // Image to Image Tools
  analyzeimage: "/api/analyzeimage",
  chainofzoom: "/api/chainofzoom",
  clarityupscaler: "/api/clarityupscaler",
  elementaldesign: "/api/elementaldesign",
  flowdesign: "/api/flowdesign",
  mirrormagic: "/api/mirrormagic",
  pairing: "/api/pairing",
  reframe: "/api/reframe",
  removebg: "/api/removebg",
  scenecomposition: "/api/scenecomposition",
  timeofday: "/api/timeofday",
  upscale: "/api/upscale",
  posterize: "/api/posterize",
  // Image to Video Tools
  "seedancevideo-floating": "/api/seedancevideo-floating",
  "seedancevideo-liquid": "/api/seedancevideo-liquid",
  "seedancevideo-misty": "/api/seedancevideo-misty",
  "seedancevideo-noir": "/api/seedancevideo-noir",
  "seedancevideo-premium": "/api/seedancevideo-premium",
  "seedancevideo-turntable": "/api/seedancevideo-turntable",
  // Video to Video Tools
  videooutpainting: "/api/videooutpainting",
  videoreframe: "/api/videoreframe",
  videosound: "/api/videosound",
  videoupscaler: "/api/videoupscaler",
};

// Tool-specific parameter defaults
const TOOL_PARAMETERS: Record<string, Record<string, string>> = {
  upscale: {
    upscaling_factor: "4",
    overlapping_tiles: "false",
    checkpoint: "v1",
  },
  reframe: {
    imageSize: "landscape",
  },
  videooutpainting: {
    aspect_ratio: "16:9",
    resolution: "720p",
    expand_left: "true",
    expand_right: "true",
    expand_ratio: "0.25",
    num_frames: "81",
    frames_per_second: "16",
    num_inference_steps: "30",
    guidance_scale: "5.0",
  },
  videoreframe: {
    aspect_ratio: "9:16",
    resolution: "720p",
    zoom_factor: "0",
    num_inference_steps: "30",
    guidance_scale: "5",
  },
  videosound: {
    prompt:
      "Generate realistic ambient and foreground sounds that match the visual content, timing, environment, and actions in the video. Ensure the audio reflects the correct atmosphere, object interactions, materials, spatial depth, and motion. Maintain temporal alignment and avoid adding unrelated sounds.",
    original_sound_switch: "false",
  },
};

export async function handleToolcall(
  formData: FormData,
): Promise<NextResponse> {
  console.log("🛠️ TOOLCALL ROUTER: Processing direct tool request");

  try {
    const toolcall = formData.get("toolcall") as string;
    const userid = formData.get("userid") as string;
    const productPath =
      (formData.get("product") as string) ||
      (formData.get("product_image_url") as string);

    // Validate required parameters
    if (!toolcall) {
      return NextResponse.json(
        {
          status: "error",
          error: "Missing toolcall parameter",
        },
        { status: 400 },
      );
    }

    if (!userid) {
      return NextResponse.json(
        {
          status: "error",
          error: "Missing userid parameter",
        },
        { status: 400 },
      );
    }

    // Check if tool exists
    const endpoint = TOOL_ENDPOINTS[toolcall];
    if (!endpoint) {
      return NextResponse.json(
        {
          status: "error",
          error: `Unknown tool: ${toolcall}`,
        },
        { status: 400 },
      );
    }

    console.log(`🎯 Routing to tool: ${toolcall} -> ${endpoint}`);

    // Prepare the request for the tool API
    const toolFormData = new FormData();

    // Copy all existing form data
    const entries = Array.from(formData.entries());
    for (const [key, value] of entries) {
      toolFormData.append(key, value);
    }

    // Handle product image (uploaded image for tools)
    if (productPath) {
      console.log(`🖼️ Processing product image: ${productPath}`);

      // For Firebase URLs, set as image_url
      if (productPath.includes("firebasestorage.googleapis.com")) {
        toolFormData.set("image_url", productPath);
      }

      // For video tools, also set video_url if needed
      if (toolcall.includes("video") && !toolcall.startsWith("seedancevideo")) {
        toolFormData.set("video_url", productPath);
      }
    }

    // Add tool-specific parameters
    const toolParams = TOOL_PARAMETERS[toolcall];
    if (toolParams) {
      console.log(`⚙️ Adding tool parameters for ${toolcall}:`, toolParams);
      Object.entries(toolParams).forEach(([key, value]) => {
        toolFormData.set(key, value);
      });
    }

    // Get the base URL for the API call
    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : process.env.NEXT_PUBLIC_BASE_URL || "https://imai.studio";

    console.log(`🚀 Calling ${baseUrl}${endpoint}`);

    // Check if this tool expects JSON instead of FormData
    const jsonTools = ["clarityupscaler"];
    const expectsJson = jsonTools.includes(toolcall);

    let requestBody;
    let headers: Record<string, string> = {};

    if (expectsJson) {
      // Convert FormData to JSON for tools that expect JSON
      const jsonData: Record<string, any> = {};
      const entries = Array.from(toolFormData.entries());
      for (const [key, value] of entries) {
        jsonData[key] = value;
      }

      // Map FormData fields to expected JSON fields for clarityupscaler
      if (toolcall === "clarityupscaler") {
        requestBody = JSON.stringify({
          imageUrl:
            jsonData.image_url ||
            jsonData.product_image_url ||
            jsonData.product,
          prompt: jsonData.prompt || "enhance clarity and resolution",
          upscaleFactor: parseInt(jsonData.upscaleFactor) || 2,
          creativity: parseFloat(jsonData.creativity) || 0.35,
          resemblance: parseFloat(jsonData.resemblance) || 0.6,
          guidanceScale: parseInt(jsonData.guidanceScale) || 4,
          numInferenceSteps: parseInt(jsonData.numInferenceSteps) || 18,
          enableSafetyChecker: jsonData.enableSafetyChecker !== "false",
        });
      } else {
        requestBody = JSON.stringify(jsonData);
      }

      headers["Content-Type"] = "application/json";
      console.log(`📦 Sending JSON body to ${toolcall}:`, requestBody);
    } else {
      // Use FormData for tools that expect it
      requestBody = toolFormData;
      console.log(`📦 Sending FormData to ${toolcall}`);
    }

    // Call the tool API
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: headers,
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Tool API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        {
          status: "error",
          error: `Tool API error: ${response.status} - ${errorText}`,
        },
        { status: response.status },
      );
    }

    const result = await response.json();
    console.log(`✅ Tool execution completed successfully`);

    // Handle tool-specific response formatting
    let message = result.message || `${toolcall} completed successfully`;
    let images: string[] = [];

    // Special handling for analyze image - ensure analysis text is displayed
    if (toolcall === "analyzeimage" && result.result) {
      if (result.result.raw_analysis) {
        message = result.result.raw_analysis;
      } else if (typeof result.result === "object") {
        // Format structured analysis as readable text
        message = `Image Analysis:\n${JSON.stringify(result.result, null, 2)}`;
      }
    }

    // Special handling for clarity upscaler - extract image URL
    if (toolcall === "clarityupscaler" && result.success && result.imageUrl) {
      images = [result.imageUrl];
      message = "Image enhanced with improved clarity and resolution";
    }

    // 🔧 CRITICAL FIX: Sanitize result for Firebase-safe storage
    const sanitizeForFirebase = (obj: any): any => {
      if (!obj || typeof obj !== "object") return obj;

      const sanitized: any = {};

      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) {
          continue;
        } else if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          sanitized[key] = value;
        } else if (Array.isArray(value)) {
          // Sanitize array elements
          sanitized[key] = value
            .filter((item) => item !== null && item !== undefined)
            .map((item) =>
              typeof item === "object"
                ? JSON.stringify(item).substring(0, 500)
                : String(item),
            );
        } else if (typeof value === "object") {
          // Convert complex objects to JSON strings to avoid nested entity issues
          sanitized[key] = JSON.stringify(value).substring(0, 1000);
        }
      }

      return sanitized;
    };

    // Return standardized response with sanitized result
    return NextResponse.json({
      status: result.status || "success",
      message: message,
      result: sanitizeForFirebase(result), // 🔧 FIX: Sanitized result
      images:
        images.length > 0
          ? images
          : result.images || (result.imageUrl ? [result.imageUrl] : []),
      videos: result.videos || (result.videoUrl ? [result.videoUrl] : []),
      intent: {
        intent: `Execute ${toolcall} tool`,
        endpoint: toolcall,
        parameters: JSON.stringify(toolParams || {}), // 🔧 FIX: Convert to JSON string
        confidence: 1.0,
        explanation: `Direct tool execution: ${toolcall}`,
      },
      conversation_id: `${userid}_${Date.now()}`,
    });
  } catch (error: any) {
    console.error(`❌ Toolcall routing error:`, error);
    return NextResponse.json(
      {
        status: "error",
        error: `Toolcall routing failed: ${error.message || error}`,
      },
      { status: 500 },
    );
  }
}
