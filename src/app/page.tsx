import { MorphingText } from "@/components/magicui/morphing-text";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen min-w-full p-8 sm:p-20 font-[family-name:var(--font-geist-sans)] bg-black text-white">
      <MorphingText texts={["IMAI", "Genrate", "Newness"]} />
    </div>
  );
}