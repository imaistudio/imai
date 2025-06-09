import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import sharp from "sharp";
import cloudinary from "cloudinary";

// Cloudinary config
cloudinary.v2.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
	api_key: process.env.CLOUDINARY_API_KEY!,
	api_secret: process.env.CLOUDINARY_API_SECRET!,
});

function createDirectories() {
	const outputPath = path.resolve("output");
	if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
}

function getLatestImage(folder: string): string {
	const folderPath = path.resolve(folder);
	if (!fs.existsSync(folderPath))
		throw new Error(`Folder ${folder} does not exist`);
	const images = fs
		.readdirSync(folderPath)
		.filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file));
	if (images.length === 0) throw new Error(`No images found in ${folder}`);
	const sorted = images
		.map((img) => path.join(folderPath, img))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	return sorted[0];
}

async function uploadToCloudinary(
	imagePath: string
): Promise<{ publicUrl: string; publicId: string }> {
	const result = await cloudinary.v2.uploader.upload(imagePath, {
		folder: "clarity_upscaler_temp",
		use_filename: true,
		unique_filename: false,
		resource_type: "image",
	});
	return { publicUrl: result.secure_url, publicId: result.public_id };
}

function delayedDeleteFromCloudinary(publicId: string) {
	setTimeout(() => {
		cloudinary.v2.uploader.destroy(publicId, (err, result) => {
			if (err) console.error("Failed to delete from Cloudinary:", err);
			else console.log("Deleted from Cloudinary:", result);
		});
	}, 45000);
}

async function convertToPng(imagePath: string): Promise<string> {
	if (imagePath.endsWith(".png")) return imagePath;
	const newPath = path.join(
		tmpdir(),
		`${path.basename(imagePath, path.extname(imagePath))}.png`
	);
	await sharp(imagePath).png().toFile(newPath);
	return newPath;
}

async function submitFalJob(input: any) {
	const res = await axios.post(
		"https://api.fal.ai/v1/predictions",
		{
			model: "fal-ai/clarity-upscaler",
			input,
		},
		{
			headers: {
				Authorization: `Bearer ${process.env.FAL_API_KEY}`,
				"Content-Type": "application/json",
			},
		}
	);
	return res.data;
}

async function checkFalStatus(requestId: string) {
	const res = await axios.get(
		`https://api.fal.ai/v1/predictions/${requestId}`,
		{
			headers: {
				Authorization: `Bearer ${process.env.FAL_API_KEY}`,
			},
		}
	);
	return res.data;
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse
) {
	if (req.method !== "POST")
		return res.status(405).json({ error: "Method not allowed" });

	const {
		upscale_factor = 2,
		prompt = "masterpiece, best quality, highres",
		negative_prompt = "(worst quality, low quality, normal quality:2)",
		creativity = 0.35,
		resemblance = 0.6,
		guidance_scale = 4,
		num_inference_steps = 18,
		enable_safety_checker = true,
		input_image,
	} = req.body;

	try {
		createDirectories();

		let localImagePath: string;

		if (input_image?.startsWith("http")) {
			const response = await axios.get(input_image, {
				responseType: "arraybuffer",
			});
			const tmpPath = path.join(tmpdir(), `input_${Date.now()}.jpg`);
			fs.writeFileSync(tmpPath, Buffer.from(response.data));
			localImagePath = tmpPath;
		} else if (input_image) {
			localImagePath = input_image;
		} else {
			localImagePath = getLatestImage("main_images");
		}

		const pngImagePath = await convertToPng(localImagePath);
		const { publicUrl, publicId } = await uploadToCloudinary(pngImagePath);
		delayedDeleteFromCloudinary(publicId);

		const input = {
			image_url: publicUrl,
			prompt,
			upscale_factor,
			negative_prompt,
			creativity,
			resemblance,
			guidance_scale,
			num_inference_steps,
			enable_safety_checker,
		};

		const job = await submitFalJob(input);
		const request_id = job.id;

		let retries = 0;
		const maxRetries = 60;
		let status;

		while (retries < maxRetries) {
			status = await checkFalStatus(request_id);
			if (status.status === "starting" || status.status === "processing") {
				await new Promise((r) => setTimeout(r, 10000));
				retries++;
				continue;
			}
			if (status.status === "succeeded") break;
			if (status.status === "failed") throw new Error("Upscaling failed");
		}

		if (retries >= maxRetries) throw new Error("Timeout waiting for FAL");

		const imageUrl = status?.output?.image?.url || status?.output?.url;
		if (!imageUrl) throw new Error("No image URL in FAL result");

		const filename = `clarity_upscaled_${Date.now()}.png`;
		const localPath = path.join(path.resolve("output"), filename);
		const response = await axios.get(imageUrl, { responseType: "stream" });

		const writer = fs.createWriteStream(localPath);
		response.data.pipe(writer);
		await new Promise<void>((resolve, reject) => {
			writer.on("finish", () => resolve());
			writer.on("error", reject);
		});

		return res.status(200).json({ status: "success", imageUrl, localPath });
	} catch (err: any) {
		console.error(err);
		return res
			.status(500)
			.json({ error: err.message || "Internal server error" });
	}
}
