"use client";
import Footer from "../components/footer";
import Header from "../components/header";
import { ImageZoomModal } from "../components/ImageZoomModal";

export default function Masonry() {
  const images = [
    "/masonry/1.jpeg",
    "/masonry/2.jpg",
    "/masonry/3.webp",
    "/masonry/5.png",
    "/masonry/gen1.jpg",
    "/masonry/gen2.jpg",
    "/masonry/gen3.jpeg",
    "/masonry/gen4.jpg",
    "/masonry/gen5.jpg",
    "/masonry/gen6.webp",
    "/masonry/gen7.jpg",
    "/masonry/gen8.jpg",
    "/masonry/gen9.avif",
    "/masonry/gen10.jpg",
    "/masonry/gen11.jpeg",
    "/masonry/gen12.jpg",
    "/masonry/gen13.png",
    "/masonry/gen14.jpg",
    "/masonry/gen15.webp",
  ];

  return (
    <>
      <Header></Header>
      <main className="dark:bg-black bg-white min-h-screen p-6">
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {images.map((src, index) => (
            <div
              key={index}
              className="w-full break-inside-avoid overflow-hidden rounded-2xl shadow-md"
            >
              <ImageZoomModal
                src={src}
                alt={`Masonry ${index + 1}`}
                className="w-full h-auto rounded-2xl object-cover"
              />
            </div>
          ))}
        </div>
      </main>
      <Footer></Footer>
    </>
  );
}
