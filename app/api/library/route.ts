import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

console.log("🔥 Firebase initialized for library route");

interface MediaItem {
  url: string;
  type: "image" | "video";
  name: string;
  createdAt: number;
}

const isImageFile = (filename: string): boolean => {
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".avif",
    ".svg",
    ".bmp",
  ];
  return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
};

const isVideoFile = (filename: string): boolean => {
  const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
    ".flv",
    ".wmv",
  ];
  return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const userId = searchParams.get("userId");
    const offset = (page - 1) * limit;

    // Validate userId
    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    console.log(`📊 Fetching library media for user ${userId} - Page: ${page}, Limit: ${limit}, Offset: ${offset}`);

    const storage = getStorage();
    const bucket = storage.bucket();
    
    // Get all files from the user's output directory
    const [files] = await bucket.getFiles({
      prefix: `${userId}/output/`,
      maxResults: 2000, // Higher limit for user libraries
    });

    console.log(`📁 Found ${files.length} total files in user's library`);

    // Process files and get download URLs
    const mediaPromises = files
      .filter(file => {
        const filename = file.name.split('/').pop() || '';
        // Skip empty filenames and folders
        if (!filename || filename === '') return false;
        return isImageFile(filename) || isVideoFile(filename);
      })
      .map(async (file) => {
        try {
          const filename = file.name.split('/').pop() || '';
          
          // Get file metadata for creation time
          const [metadata] = await file.getMetadata();
          
          // Get signed URL that's valid for 1 hour
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });

          let type: "image" | "video" = "image";
          if (isImageFile(filename)) {
            type = "image";
          } else if (isVideoFile(filename)) {
            type = "video";
          }

          return {
            url: signedUrl,
            type,
            name: filename,
            createdAt: metadata.timeCreated ? new Date(metadata.timeCreated).getTime() : Date.now(),
          } as MediaItem;
        } catch (error) {
          console.error(`❌ Error processing file ${file.name}:`, error);
          return null;
        }
      });

    // Wait for all promises to resolve and filter out null values
    const allMediaItems = (await Promise.all(mediaPromises)).filter(
      (item): item is MediaItem => item !== null
    );

    console.log(`✅ Successfully processed ${allMediaItems.length} media items`);

    // Sort files by creation date (newest first)
    allMediaItems.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const paginatedItems = allMediaItems.slice(offset, offset + limit);
    const hasMore = offset + limit < allMediaItems.length;
    const totalItems = allMediaItems.length;

    console.log(`📄 Returning ${paginatedItems.length} items for page ${page}, has more: ${hasMore}`);

    return NextResponse.json({
      items: paginatedItems,
      pagination: {
        page,
        limit,
        offset,
        total: totalItems,
        hasMore,
        totalPages: Math.ceil(totalItems / limit),
      },
    });

  } catch (error) {
    console.error("❌ Error in library API:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch library items",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 