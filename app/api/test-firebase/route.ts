import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Test 1: Check if Firebase Admin is initialized
    const apps = getApps();
    const isInitialized = apps.length > 0;

    // Test 2: Check environment variables
    const envVars = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Not Set',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Not Set',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'Set' : 'Not Set',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? 'Set' : 'Not Set',
    };

    // Test 3: Try to get auth instance
    let authTest = 'Not Tested';
    try {
      const auth = getAuth();
      authTest = 'Success';
    } catch (error) {
      authTest = `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return NextResponse.json({
      status: 'success',
      tests: {
        firebase_initialized: isInitialized,
        environment_variables: envVars,
        auth_instance: authTest,
      },
      message: isInitialized ? 'Firebase Admin SDK is properly initialized' : 'Firebase Admin SDK initialization failed',
    });
  } catch (error) {
    console.error('Test route error:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      tests: {
        firebase_initialized: false,
        environment_variables: {
          FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Not Set',
          FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Not Set',
          FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'Set' : 'Not Set',
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? 'Set' : 'Not Set',
        },
        auth_instance: 'Not Tested',
      },
    }, { status: 500 });
  }
}

// Test endpoint that requires a user ID
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userid } = await request.json();

    if (!userid) {
      return NextResponse.json({
        status: 'error',
        error: 'userid is required',
      }, { status: 400 });
    }

    // Try to get the user
    try {
      const user = await getAuth().getUser(userid);
      return NextResponse.json({
        status: 'success',
        message: 'User verification successful',
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      });
    } catch (error) {
      return NextResponse.json({
        status: 'error',
        error: 'Failed to verify user',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: 'Invalid request',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 400 });
  }
} 