// app/api/debug-auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken, userId } = body;

    console.log('Debug info:', {
      hasIdToken: !!idToken,
      hasUserId: !!userId,
      tokenPreview: idToken ? `${idToken.substring(0, 20)}...` : 'none',
      projectId: process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    });

    if (!idToken || !userId) {
      return NextResponse.json({
        error: 'Missing idToken or userId',
        debug: { hasIdToken: !!idToken, hasUserId: !!userId }
      }, { status: 400 });
    }

    // Try to verify the token
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      
      return NextResponse.json({
        success: true,
        tokenValid: true,
        decodedUid: decodedToken.uid,
        providedUid: userId,
        uidMatch: decodedToken.uid === userId,
        tokenClaims: {
          iss: decodedToken.iss,
          aud: decodedToken.aud,
          exp: decodedToken.exp,
          iat: decodedToken.iat,
        }
      });
    } catch (tokenError: any) {
      console.error('Token verification error:', tokenError);
      
      return NextResponse.json({
        error: 'Token verification failed',
        tokenError: tokenError.message,
        errorCode: tokenError.code,
        debug: {
          tokenLength: idToken.length,
          tokenStart: idToken.substring(0, 50),
        }
      }, { status: 401 });
    }

  } catch (error: any) {
    console.error('Debug auth error:', error);
    return NextResponse.json({
      error: 'Request processing failed',
      message: error.message,
      debug: {
        hasFirebaseAdmin: !!getApps().length,
        envVars: {
          projectId: !!process.env.FIREBASE_PROJECT_ID,
          clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        }
      }
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Auth debug endpoint',
    firebaseAppsInitialized: getApps().length,
    envCheck: {
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      openaiKey: !!process.env.OPENAI_API_KEY,
    }
  });
}