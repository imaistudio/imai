// app/about/page.tsx or page.jsx

import Footer from "@/app/components/footer";
import Header from "../components/header";
import { HeroParallaxDemo } from "../components/HeroParallaxDemo";


export default function AboutPage() {
  return (
    <>
    <Header className="pt-6 pb-6 bg-black text-white"></Header>
    <main className="bg-black text-white">
    <HeroParallaxDemo />
    </main>
    <Footer></Footer>
    </>
  );
}
