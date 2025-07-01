import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

// Initialize Firebase Admin
if (!getApps().length) {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
  };

  initializeApp({
    credential: cert(serviceAccount as any),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = getFirestore();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Extract all form data
    const inviteData = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string,
      company: formData.get('company') as string || null,
      role: formData.get('role') as string || null,
      website: formData.get('website') as string || null,
      useCase: formData.get('useCase') as string,
      experience: formData.get('experience') as string || null,
      referral: formData.get('referral') as string || null,
      submittedAt: new Date().toISOString(),
      status: 'pending', // pending, approved, rejected
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };

    // Debug log to see what data we're receiving
    console.log('Received form data:', {
      firstName: inviteData.firstName,
      lastName: inviteData.lastName,
      email: inviteData.email,
      useCase: inviteData.useCase,
    });

    // Validate required fields
    if (!inviteData.firstName || !inviteData.lastName || !inviteData.email || !inviteData.useCase) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName, email, and useCase are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteData.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingInvites = await db.collection('invites')
      .where('email', '==', inviteData.email)
      .get();

    if (!existingInvites.empty) {
      return NextResponse.json(
        { error: 'An invite request with this email already exists' },
        { status: 409 }
      );
    }

    // Store in Firestore
    const docRef = await db.collection('invites').add(inviteData);
    
    // Log for admin monitoring
    console.log(`New invite request submitted: ${docRef.id} - ${inviteData.email}`);

    // Send notification email to admins (optional)
    // You can integrate with your email service here
    
    return NextResponse.json(
      { 
        success: true, 
        message: 'Invite request submitted successfully',
        id: docRef.id 
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error processing invite request:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Please try again later'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve invite requests (admin only)
export async function GET(request: NextRequest) {
  try {
    // You can add admin authentication here
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = db.collection('invites').orderBy('submittedAt', 'desc');

    if (email) {
      query = query.where('email', '==', email) as any;
    }

    if (status) {
      query = query.where('status', '==', status) as any;
    }

    const snapshot = await query.limit(limit).get();
    const invites = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ invites });

  } catch (error) {
    console.error('Error fetching invite requests:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}