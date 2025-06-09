import { NextResponse } from "next/server";
import { OpenAI } from "openai";
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { base64Image } = body;
		if (!base64Image) {
			return NextResponse.json(
				{ error: "base64Image is required" },
				{ status: 400 }
			);
		}
		const response = await openai.chat.completions.create({
			model: process.env.OPENAI_MODEL || "gpt-4.1",
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Analyze the design elements in this image. Focus on: colors, shapes, patterns, textures, and composition. Do not mention specific objects or types. Format the response as a JSON object with these categories.",
						},
						{
							type: "image_url",
							image_url: {
								url: `data:image/jpeg;base64,${base64Image}`,
							},
						},
					],
				},
			],
			max_tokens: 500,
		});
		const analysis = response.choices[0]?.message?.content || "{}";
		try {
			const result = JSON.parse(analysis);
			return NextResponse.json({ result });
		} catch (err) {
			return NextResponse.json({ result: { raw_analysis: analysis } });
		}
	} catch (error: any) {
		console.error("API Error:", error);
		return NextResponse.json(
			{ error: error.message || "Unknown error" },
			{ status: 500 }
		);
	}
}
