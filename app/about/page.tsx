"use client";
import Footer from "@/app/components/footer";
import Header from "../components/header";
import { HeroParallaxDemo } from "../components/HeroParallaxDemo";
import MobileNavRest from "@/app/components/MobileNavRest";
export default function AboutPage() {
  return (
    <>
      <Header></Header>
      <MobileNavRest />
      <main className="bg-white text-black dark:bg-black dark:text-white">
        <HeroParallaxDemo />
      </main>
      <Footer></Footer>
    </>
  );
}
