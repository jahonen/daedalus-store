"use client";

import { useState } from "react";
import Image from "next/image";
import "./ProductGallery.scss";

export interface GalleryImage {
  url: string;
  alt: string;
}

/**
 * Lifecycle: beta — PDP image gallery.
 *
 * Full-size hero image on top; thumbnail strip underneath to switch.
 * Single image: no strip, just the hero. Zero images: placeholder.
 */
export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return <div className="product-media-placeholder" aria-hidden />;
  }

  const current = images[active];

  return (
    <div className="product-gallery">
      <div className="gallery-hero">
        <Image
          src={current.url}
          alt={current.alt}
          width={800}
          height={800}
          sizes="(min-width: 768px) 50vw, 100vw"
          priority
        />
      </div>

      {images.length > 1 && (
        <div className="gallery-thumbs" role="tablist" aria-label="Product images">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`View image ${i + 1}`}
              className={`gallery-thumb${i === active ? " active" : ""}`}
              onClick={() => setActive(i)}
            >
              <Image
                src={img.url}
                alt=""
                width={120}
                height={120}
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
