import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

interface KlingRequest {
  image: string;
}

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body: KlingRequest = await request.json();

    // Validate required fields
    if (!body.image) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Get API credentials from environment variables
    const accessKey = process.env.KLING_ACCESS_KEY;
    const secretKey = process.env.KLING_SECRET_KEY;
    
    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: 'Kling API credentials not configured. Please set KLING_ACCESS_KEY and KLING_SECRET_KEY' },
        { status: 500 }
      );
    }

    // Generate JWT token for authentication (following official Kling AI documentation)
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: accessKey,  // Access Key as issuer (withIssuer in Java)
      exp: now + (30 * 60), // 30 minutes expiry (withExpiresAt in Java)
      nbf: now - 5,    // Not before - 5 seconds ago (withNotBefore in Java)
    };

    // Use HS256 algorithm with secret key directly (Algorithm.HMAC256(sk) in Java)
    const token = jwt.sign(payload, secretKey, { 
      algorithm: 'HS256',
      header: {
        alg: 'HS256',  // Explicitly set algorithm in header
        typ: 'JWT'
      }
    });

    // Debug: Log JWT generation (remove in production)
    console.log('JWT Payload:', JSON.stringify(payload, null, 2));
    console.log('Access Key:', accessKey);
    console.log('Secret Key Length:', secretKey.length);
    console.log('Generated Token:', token);

    // Prepare the request payload with hardcoded values
    const klingPayload = {
      model_name: "kling-v1",
      mode: "pro",
      duration: "5",
      image: body.image,
      prompt: "360 view of the image",
      cfg_scale: 0.5
    };

    // Make request to Kling API
    const response = await fetch('https://api.klingai.com/v1/videos/image2video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(klingPayload)
    });

    const data = await response.json();

    // Debug: Log the full response for troubleshooting
    console.log('Kling API Response Status:', response.status);
    console.log('Kling API Response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error('Kling API error:', data);
      return NextResponse.json(
        { 
          error: 'Failed to generate video',
          details: data.message || 'Unknown error',
          status: response.status,
          kling_response: data // Include full response for debugging
        },
        { status: response.status }
      );
    }

    // Return the successful response
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in Kling API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
