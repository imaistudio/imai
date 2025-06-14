"use client"
import Footer from "@/app/components/footer";
import Header from "../components/header";
import { HeroParallaxDemo } from "../components/HeroParallaxDemo";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "About IMAI.studio | AI Image Generation Platform",
	description: "Learn about IMAI.studio's mission to revolutionize digital art creation through AI. Discover our story, technology, and commitment to creative innovation.",
	keywords: "about IMAI.studio, AI art platform, AI image generation company, digital art innovation, AI creativity platform, artificial intelligence art company, AI art technology, creative AI solutions, AI art mission, digital art revolution",
};

export default function AboutPage() {
	return (
		<>
			<Header></Header>
			<main className="bg-white text-black dark:bg-black dark:text-white">
				<HeroParallaxDemo />
			</main>
			<Footer></Footer>
		</>
	);
}
