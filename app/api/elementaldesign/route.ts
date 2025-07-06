import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
    storageBucket: "imai-studio-fae1b.firebasestorage.app"
  });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface InputImage {
  buffer: Buffer;
  field: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🎨 ELEMENTAL DESIGN ROUTE: Request received');
    
    const formData = await request.formData();
    const userId = formData.get('userId') as string;
    const userMessage = formData.get('userMessage') as string || 'Create an elemental pattern design using the uploaded elements';
    
    // Get input images (2-3 expected)
    const inputImages: InputImage[] = [];
    const inputUrls: Record<string, string> = {};
    
    // Check for product_image, design_image, color_image
    const imageFields = ['product_image', 'design_image', 'color_image'];
    
    for (const field of imageFields) {
      const imageFile = formData.get(field) as File;
      if (imageFile) {
        const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        inputImages.push({ buffer: imageBuffer, field });
        
        // Upload to Firebase Storage
        const storage = getStorage();
        const bucket = storage.bucket("imai-studio-fae1b.firebasestorage.app");
        const fileName = `${userId}/input/elemental_${field}_${Date.now()}.png`;
        const file = bucket.file(fileName);
        
        await file.save(imageBuffer, {
          metadata: {
            contentType: 'image/png',
          },
        });
        
        const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        inputUrls[field] = downloadUrl;
        console.log(`✅ Uploaded ${field} to Firebase:`, downloadUrl);
      }
    }
    
    if (inputImages.length < 2) {
      return NextResponse.json({ 
        error: 'Elemental design requires at least 2 input images' 
      }, { status: 400 });
    }
    
    console.log(`🎨 ELEMENTAL DESIGN: Processing ${inputImages.length} input images`);
    
    // Analyze each image to identify main elements
    const elementAnalyses = [];
    
    for (const { buffer, field } of inputImages) {
      console.log(`🔍 Analyzing ${field} for main elements...`);
      
      // Convert buffer to base64 for OpenAI
      const base64Image = buffer.toString('base64');
      
      const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image and identify the main element/object that would work well in a repeating pattern design. Focus on:
                  
1. **Primary Element**: What is the main object/element in this image?
2. **Element Description**: Describe its shape, form, and key visual characteristics
3. **Pattern Suitability**: How would this element work in a repeating pattern?
4. **Style Notes**: What style/aesthetic does this element have?

Provide a concise analysis focusing on the element that would be most suitable for pattern design.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 300
        })
      });
      
      const analysisResult = await analysisResponse.json();
      const elementAnalysis = analysisResult.choices[0].message.content;
      elementAnalyses.push(elementAnalysis);
      
      console.log(`✅ ${field} analysis complete`);
    }
    
    // Combine all element analyses into a unified pattern prompt
    const combinedPrompt = `
🎨 ELEMENTAL PATTERN DESIGN BRIEF:

**OBJECTIVE**: Create a sophisticated repeating pattern design using the actual elements from the analyzed images.

**ELEMENT ANALYSES**:
${elementAnalyses.map((analysis, index) => `
**Element ${index + 1}**:
${analysis}
`).join('\n')}

**PATTERN REQUIREMENTS**:
- Use the ACTUAL elements identified above (not just inspired by them)
- Create a seamless repeating pattern that could work for textiles, wallpapers, or surfaces
- Arrange elements in multiple angles and orientations for visual interest
- Maintain proper spacing and balance between elements
- Ensure pattern flows naturally and doesn't feel chaotic
- Style should be cohesive across all elements

**VISUAL SPECIFICATIONS**:
- Professional pattern design quality
- Clean, modern aesthetic
- Balanced composition with good negative space
- Elements should be recognizable but stylized for pattern use
- Consider scale relationships between different elements
- Use consistent lighting/shading across all elements

**TECHNICAL REQUIREMENTS**:
- Seamless repeat (tileable)
- High contrast and clarity
- Suitable for commercial pattern use
- Pattern should work at multiple scales

USER INTENT: ${userMessage}

Generate a professional elemental pattern design that incorporates all the identified elements in a harmonious, repeating composition.`;

    console.log('🎯 ELEMENTAL DESIGN: Generated unified prompt');
    
    // Generate the pattern using OpenAI DALL-E
    const generationResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: combinedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
      })
    });
    
    const generationResult = await generationResponse.json();
    
    if (!generationResult.data || generationResult.data.length === 0) {
      throw new Error('No image generated from OpenAI');
    }
    
    const generatedImageUrl = generationResult.data[0].url;
    const revisedPrompt = generationResult.data[0].revised_prompt;
    
    console.log('✅ ELEMENTAL DESIGN: Pattern generated successfully');
    
    // Download and upload to Firebase Storage
    const imageResponse = await fetch(generatedImageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    
    const storage = getStorage();
    const bucket = storage.bucket("imai-studio-fae1b.firebasestorage.app");
    const outputFileName = `${userId}/output/elemental_pattern_${Date.now()}.png`;
    const outputFile = bucket.file(outputFileName);
    
    await outputFile.save(imageBuffer, {
      metadata: {
        contentType: 'image/png',
      },
    });
    
    const firebaseOutputUrl = `https://storage.googleapis.com/${bucket.name}/${outputFileName}`;
    console.log('✅ ELEMENTAL DESIGN: Output uploaded to Firebase:', firebaseOutputUrl);
    
    // Return the result
    return NextResponse.json({
      status: 'success',
      firebaseInputUrls: inputUrls,
      firebaseOutputUrl,
      workflow_type: 'elemental_pattern',
      generated_prompt: combinedPrompt,
      revised_prompt: revisedPrompt,
      element_analyses: elementAnalyses,
      model_used: 'dall-e-3',
      generation_method: 'elemental_design',
      streaming_supported: false
    });
    
  } catch (error) {
    console.error('❌ ELEMENTAL DESIGN ERROR:', error);
    return NextResponse.json({ 
      error: 'Failed to generate elemental pattern design',
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 