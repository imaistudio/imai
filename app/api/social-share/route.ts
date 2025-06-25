import { NextRequest, NextResponse } from "next/server";
import {
  SocialMediaHandler,
  SOCIAL_MEDIA_PLATFORMS,
  SOCIAL_MEDIA_CONTEXTS,
} from "@/lib/agents/userAgents";

export async function POST(request: NextRequest) {
  try {
    const {
      imageUrl,
      platforms,
      customCaption,
      contextType = "creative",
      toneOfVoice = "friendly",
      targetAudience = "design enthusiasts",
      autoPost = false,
      scheduleTime,
      userId,
    } = await request.json();

    if (!imageUrl || !platforms || platforms.length === 0) {
      return NextResponse.json(
        { error: "Image URL and platforms are required" },
        { status: 400 },
      );
    }

    const results = [];

    for (const platform of platforms) {
      try {
        // Validate platform
        const platformConfig = SOCIAL_MEDIA_PLATFORMS.find(
          (p) => p.id === platform,
        );
        if (!platformConfig) {
          results.push({
            platform,
            success: false,
            error: `Platform ${platform} not supported`,
          });
          continue;
        }

        // Get platform context
        const contexts = SOCIAL_MEDIA_CONTEXTS[platform];
        const context =
          contexts.find((c) => c.contextType === contextType) || contexts[0];

        // Override context with user preferences
        const finalContext = {
          ...context,
          toneOfVoice,
          targetAudience,
        };

        // Generate optimized caption
        const caption = SocialMediaHandler.generateCaption(
          imageUrl,
          platform,
          finalContext,
          customCaption,
        );

        // Optimize image for platform
        const optimizedImage = SocialMediaHandler.optimizeImageForPlatform(
          imageUrl,
          platform,
          "feed",
        );

        // Prepare post data
        const postData = {
          imageUrl: optimizedImage.optimizedUrl,
          caption,
          platform,
          aspectRatio: optimizedImage.aspectRatio,
          size: optimizedImage.size,
          scheduledFor: scheduleTime ? new Date(scheduleTime) : null,
          userId,
        };

        if (autoPost) {
          // Auto-post to platform (would integrate with actual APIs)
          const postResult = await postToPlatform(platform, postData);
          results.push({
            platform,
            success: postResult.success,
            postId: postResult.postId,
            postUrl: postResult.postUrl,
            caption,
            optimizedImage,
            error: postResult.error,
          });
        } else {
          // Just prepare the content for manual posting
          results.push({
            platform,
            success: true,
            caption,
            optimizedImage,
            postData,
            message: "Content prepared for manual posting",
          });
        }
      } catch (error) {
        results.push({
          platform,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: platforms.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (error) {
    console.error("Social share error:", error);
    return NextResponse.json(
      { error: "Failed to process social sharing request" },
      { status: 500 },
    );
  }
}

// Platform-specific posting functions
async function postToPlatform(
  platform: string,
  postData: any,
): Promise<{
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}> {
  try {
    switch (platform) {
      case "telegram":
        return await postToTelegram(postData);
      case "linkedin":
        return await postToLinkedIn(postData);
      case "pinterest":
        return await postToPinterest(postData);
      case "reddit":
        return await postToReddit(postData);
      case "instagram":
        return await postToInstagram(postData);
      default:
        return { success: false, error: "Platform not implemented" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Posting failed",
    };
  }
}

async function postToTelegram(postData: any) {
  // Telegram Bot API integration
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!botToken || !channelId) {
    return { success: false, error: "Telegram credentials not configured" };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        photo: postData.imageUrl,
        caption: postData.caption,
        parse_mode: "HTML",
      }),
    },
  );

  const result = await response.json();

  if (result.ok) {
    return {
      success: true,
      postId: result.result.message_id.toString(),
      postUrl: `https://t.me/${channelId.replace("@", "")}/${result.result.message_id}`,
    };
  } else {
    return { success: false, error: result.description };
  }
}

async function postToLinkedIn(postData: any) {
  // LinkedIn API integration
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personId = process.env.LINKEDIN_PERSON_ID;

  if (!accessToken || !personId) {
    return { success: false, error: "LinkedIn credentials not configured" };
  }

  // First upload the image
  const uploadResponse = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: `urn:li:person:${personId}`,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  );

  const uploadData = await uploadResponse.json();

  // Upload image to LinkedIn
  const imageUploadResponse = await fetch(
    uploadData.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl,
    {
      method: "POST",
      body: await fetch(postData.imageUrl).then((r) => r.blob()),
    },
  );

  if (!imageUploadResponse.ok) {
    return { success: false, error: "Failed to upload image to LinkedIn" };
  }

  // Create the post
  const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      author: `urn:li:person:${personId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: postData.caption,
          },
          shareMediaCategory: "IMAGE",
          media: [
            {
              status: "READY",
              description: {
                text: "Design created with IMAI",
              },
              media: uploadData.value.asset,
              title: {
                text: "IMAI Design",
              },
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  const postResult = await postResponse.json();

  if (postResponse.ok) {
    return {
      success: true,
      postId: postResult.id,
      postUrl: `https://www.linkedin.com/feed/update/${postResult.id}`,
    };
  } else {
    return { success: false, error: postResult.message };
  }
}

async function postToPinterest(postData: any) {
  // Pinterest API integration
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;

  if (!accessToken || !boardId) {
    return { success: false, error: "Pinterest credentials not configured" };
  }

  const response = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      board_id: boardId,
      media_source: {
        source_type: "image_url",
        url: postData.imageUrl,
      },
      description: postData.caption,
      title: "IMAI Design Creation",
    }),
  });

  const result = await response.json();

  if (response.ok) {
    return {
      success: true,
      postId: result.id,
      postUrl: `https://pinterest.com/pin/${result.id}`,
    };
  } else {
    return { success: false, error: result.message };
  }
}

async function postToReddit(postData: any) {
  // Reddit API integration
  const accessToken = process.env.REDDIT_ACCESS_TOKEN;
  const subreddit = process.env.REDDIT_SUBREDDIT || "DesignPorn";

  if (!accessToken) {
    return { success: false, error: "Reddit credentials not configured" };
  }

  const response = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "IMAI-Design-Platform/1.0",
    },
    body: new URLSearchParams({
      api_type: "json",
      kind: "image",
      sr: subreddit,
      title: postData.caption.split("\n")[0], // Use first line as title
      url: postData.imageUrl,
      text: postData.caption,
    }),
  });

  const result = await response.json();

  if (result.json?.errors?.length === 0) {
    return {
      success: true,
      postId: result.json.data.id,
      postUrl: `https://reddit.com${result.json.data.url}`,
    };
  } else {
    return {
      success: false,
      error: result.json?.errors?.[0]?.[1] || "Reddit posting failed",
    };
  }
}

async function postToInstagram(postData: any) {
  // Instagram Basic Display API integration
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;

  if (!accessToken || !instagramUserId) {
    return { success: false, error: "Instagram credentials not configured" };
  }

  // Create media container
  const containerResponse = await fetch(
    `https://graph.instagram.com/v18.0/${instagramUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: postData.imageUrl,
        caption: postData.caption,
        access_token: accessToken,
      }),
    },
  );

  const containerData = await containerResponse.json();

  if (!containerResponse.ok) {
    return {
      success: false,
      error:
        containerData.error?.message ||
        "Failed to create Instagram media container",
    };
  }

  // Publish the media
  const publishResponse = await fetch(
    `https://graph.instagram.com/v18.0/${instagramUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerData.id,
        access_token: accessToken,
      }),
    },
  );

  const publishData = await publishResponse.json();

  if (publishResponse.ok) {
    return {
      success: true,
      postId: publishData.id,
      postUrl: `https://instagram.com/p/${publishData.id}`,
    };
  } else {
    return {
      success: false,
      error: publishData.error?.message || "Failed to publish to Instagram",
    };
  }
}

// GET endpoint to retrieve platform configurations and contexts
export async function GET() {
  return NextResponse.json({
    platforms: SOCIAL_MEDIA_PLATFORMS,
    contexts: SOCIAL_MEDIA_CONTEXTS,
    supportedFeatures: {
      autoPosting: true,
      scheduling: true,
      imageOptimization: true,
      captionGeneration: true,
      hashtagGeneration: true,
      multiPlatformBatch: true,
    },
  });
}
