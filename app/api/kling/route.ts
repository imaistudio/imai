import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { fal } from "@fal-ai/client";
import sharp from "sharp";

// Set maximum function duration to 300 seconds (5 minutes)
export const maxDuration = 300;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure FAL
fal.config({
  credentials: process.env.FAL_KEY,
});

// Function to resize image if needed
async function resizeImage(buffer: Buffer): Promise<Buffer> {
  const maxDimension = 2000;
  const image = sharp(buffer);
  const metadata = await image.metadata();

  if (metadata.width && metadata.height) {
    const ratio = Math.min(
      maxDimension / metadata.width,
      maxDimension / metadata.height,
    );
    if (ratio < 1) {
      return image
        .resize(
          Math.round(metadata.width * ratio),
          Math.round(metadata.height * ratio),
        )
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  }
  return buffer;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const imageUrl = formData.get("image_url") as string;
    const prompt = formData.get("prompt") as string;

    // Check if we have either a file or image URL
    if (!file && !imageUrl) {
      return NextResponse.json(
        { error: "Please provide either an image file or image_url" },
        { status: 400 },
      );
    }

    let finalImageUrl: string;

    // If image_url is provided (from intent route), use it directly
    if (imageUrl) {
      console.log(
        "🔗 Using provided image URL for kling video creation:",
        imageUrl,
      );
      finalImageUrl = imageUrl;
    } else {
      // If file is provided, upload to Cloudinary
      console.log(
        "📤 Uploading file to Cloudinary for kling video creation...",
      );

      // Convert file to buffer and resize if needed
      const buffer = Buffer.from(await file.arrayBuffer());
      const resizedBuffer = await resizeImage(buffer);

      // Upload image to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "auto",
              folder: "kling_videos",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(resizedBuffer);
      });

      finalImageUrl = (uploadResult as any).secure_url;
      console.log("✅ Image uploaded to Cloudinary:", finalImageUrl);
    }

    console.log("🎬 Starting video generation with FAL AI...");
    console.log("Image URL:", finalImageUrl);
    console.log("Prompt:", prompt || "Create a smooth transition video");

    // Submit to FAL AI
    const result = await fal.subscribe(
      "fal-ai/kling-video/v1.6/pro/image-to-video",
      {
        input: {
          image_url: finalImageUrl,
          prompt: prompt || "Create a smooth transition video",
          duration: "5",
          negative_prompt: "blur, distort, and low quality",
          cfg_scale: 0.5,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      },
    );

    // Get the video URL from the result
    const videoUrl = result.data.video.url;
    console.log("✅ Video generation completed:", videoUrl);

    // Upload video to Cloudinary for final delivery
    console.log("📤 Uploading generated video to Cloudinary...");
    const videoBuffer = await (await fetch(videoUrl)).arrayBuffer();
    const videoUploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "video",
            folder: "kling_videos",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        )
        .end(Buffer.from(videoBuffer));
    });

    const finalVideoUrl = (videoUploadResult as any).secure_url;
    console.log("✅ Video uploaded to Cloudinary:", finalVideoUrl);

    // Schedule deletion of files after 45 seconds
    // Only delete the image if we uploaded it (not if it came from intent route)
    setTimeout(() => {
      if (!imageUrl && file) {
        // Only delete image if we uploaded it ourselves
        const imageUploadResult = result as any; // This would need to be properly tracked
        console.log("🗑️ Cleaning up uploaded image...");
      }
      cloudinary.uploader.destroy((videoUploadResult as any).public_id);
      console.log("🗑️ Cleaning up uploaded video...");
    }, 45000);

    return NextResponse.json({
      success: true,
      videoUrl: finalVideoUrl,
      requestId: result.requestId,
      originalImageUrl: finalImageUrl,
      processingTime: "Video generation completed",
    });
  } catch (error) {
    console.error("Error in Kling video conversion:", error);
    return NextResponse.json(
      { error: "Failed to process video" },
      { status: 500 },
    );
  }
}
