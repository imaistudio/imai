// app/about/page.tsx or page.jsx

import Footer from "@/app/components/footer";
import Header from "../components/header";
import { HeroParallaxDemo } from "../components/HeroParallaxDemo";


export default function AboutPage() {
  return (
    <>
    <Header></Header>
    <main className="bg-black text-white">
    <HeroParallaxDemo />
    </main>
    <Footer></Footer>
    </>
  );
}
