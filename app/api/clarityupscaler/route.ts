import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { v2 as cloudinary } from 'cloudinary'
import sharp from 'sharp'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()
// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Upload to Cloudinary
async function uploadToCloudinary(filePath: string): Promise<{ publicUrl: string, publicId: string }> {
  const result = await cloudinary.uploader.upload(filePath)
  return {
    publicUrl: result.secure_url,
    publicId: result.public_id
  }
}

// Delete from Cloudinary after 45s
function delayedDeleteFromCloudinary(publicId: string): void {
  setTimeout(() => {
    cloudinary.uploader.destroy(publicId).catch(err => console.error('Cloudinary deletion error:', err))
  }, 45000)
}

// Convert to PNG
async function convertToPng(imagePath: string): Promise<string> {
  const pngPath = path.join(os.tmpdir(), `converted_${Date.now()}.png`)
  await sharp(imagePath).png().toFile(pngPath)
  return pngPath
}

// Get latest image from folder
async function getLatestImage(folder: string): Promise<string> {
  const dirPath = path.resolve(folder)
  const files = await fs.readdir(dirPath)
  const images = files
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(dirPath, f))

  if (images.length === 0) throw new Error('No images found')

  const stats = await Promise.all(images.map(f => fs.stat(f).then(s => ({ file: f, mtime: s.mtime }))))
  stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  return stats[0].file
}

// Submit FAL AI Job
async function submitClarityJob(input: any): Promise<{ request_id: string }> {
  const response = await fetch('https://api.fal.ai/fal-ai/clarity-upscaler/async', {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ arguments: input })
  })

  if (!response.ok) throw new Error(`FAL job submit failed: ${await response.text()}`)

  const data = await response.json()
  return { request_id: data?.request_id || data?.id }
}

// Poll for status
async function getClarityJobStatus(requestId: string): Promise<{ status: string, error?: string }> {
  const response = await fetch(`https://api.fal.ai/fal-ai/clarity-upscaler/async/${requestId}`, {
    method: 'GET',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`
    }
  })

  if (!response.ok) throw new Error(`FAL job status failed: ${await response.text()}`)

  const data = await response.json()
  return {
    status: data.status,
    error: data.error
  }
}

// Get result
async function getClarityJobResult(requestId: string): Promise<any> {
  const response = await fetch(`https://api.fal.ai/fal-ai/clarity-upscaler/async/${requestId}/outputs`, {
    method: 'GET',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`
    }
  })

  if (!response.ok) throw new Error(`FAL result fetch failed: ${await response.text()}`)

  return await response.json()
}

// Download image to local server
async function downloadImage(url: string, filename: string): Promise<string> {
  const outputPath = path.join(process.cwd(), 'public', 'output')
  await fs.mkdir(outputPath, { recursive: true })
  const fullPath = path.join(outputPath, filename)

  const writer = (await fs.open(fullPath, 'w')).createWriteStream()
  const response = await axios.get(url, { responseType: 'stream' })
  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(`/output/${filename}`))
    writer.on('error', reject)
  })
}

// Main API route
export async function POST(req: Request) {
    try {
      const { inputImage } = await req.json()
  
      if (!inputImage) {
        return NextResponse.json({ error: 'inputImage is required' }, { status: 400 })
      }
  
      const imagePath = await convertToPng(inputImage)
  
      const cloudinaryResult = await uploadToCloudinary(imagePath)
      delayedDeleteFromCloudinary(cloudinaryResult.publicId)
  
      const jobInput = {
        image_url: cloudinaryResult.publicUrl,
        prompt: 'masterpiece, best quality, highres',
        upscale_factor: 2,
        negative_prompt: '(worst quality, low quality)',
        creativity: 0.4,
        resemblance: 0.6,
        guidance_scale: 5,
        num_inference_steps: 18,
        enable_safety_checker: true
      }
  
      const { request_id } = await submitClarityJob(jobInput)
  
      // Poll for job completion
      let retries = 0
      let jobStatus: { status: string, error?: string }
      while (retries < 60) {
        jobStatus = await getClarityJobStatus(request_id)
        if (jobStatus.status === 'COMPLETED') break
        if (jobStatus.status === 'FAILED') {
          return NextResponse.json({ error: jobStatus.error || 'Upscaling failed' }, { status: 500 })
        }
        await new Promise(res => setTimeout(res, 10000))
        retries++
      }
  
      if (retries >= 60) {
        return NextResponse.json({ error: 'Timeout waiting for FAL AI job to complete' }, { status: 504 })
      }
  
      const result = await getClarityJobResult(request_id)
      const imageUrl = result?.image?.url || result?.url
      if (!imageUrl) {
        return NextResponse.json({ error: 'No image URL found in result' }, { status: 500 })
      }
  
      const localPath = await downloadImage(imageUrl, `clarity_upscaled_${Date.now()}.png`)
  
      return NextResponse.json({
        status: 'success',
        imageUrl,
        localPath
      })
    } catch (error: any) {
      console.error('Upscale API Error:', error)
      return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
  }
  
