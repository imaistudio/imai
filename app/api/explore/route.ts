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

console.log("🔥 Firebase initialized for explore route");

interface MediaItem {
  url: string;
  type: "image" | "video";
  name: string;
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

const extractNumericValue = (filename: string): number => {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    console.log(`📊 Fetching explore media - Page: ${page}, Limit: ${limit}, Offset: ${offset}`);

    const storage = getStorage();
    const bucket = storage.bucket();
    
    // Get all files from the 'expolore' directory
    const [files] = await bucket.getFiles({
      prefix: 'expolore/',
      maxResults: 1000, // Reasonable limit to prevent memory issues
    });

    console.log(`📁 Found ${files.length} total files in storage`);

    // Process files and get download URLs
    const mediaPromises = files
      .filter(file => {
        const filename = file.name.split('/').pop() || '';
        return isImageFile(filename) || isVideoFile(filename);
      })
      .map(async (file) => {
        try {
          const filename = file.name.split('/').pop() || '';
          
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

    // Sort files numerically based on their filename numbers
    allMediaItems.sort((a, b) => {
      const numA = extractNumericValue(a.name);
      const numB = extractNumericValue(b.name);
      return numA - numB;
    });

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
    console.error("❌ Error in explore API:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch media items",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 