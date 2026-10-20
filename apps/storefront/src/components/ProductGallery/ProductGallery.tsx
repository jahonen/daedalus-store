"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ZoomLightbox } from "../ZoomLightbox/ZoomLightbox";
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
 * Desktop hover pans a 2× zoom; click/tap opens a fullscreen lightbox
 * with wheel/pinch/drag zoom.
 */
export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return <div className="product-media-placeholder" aria-hidden />;
  }

  const current = images[active];

  // Mouse-only pan-zoom: origin follows cursor over the hero.
  function onHeroMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div className="product-gallery">
      <div
        ref={heroRef}
        className={`gallery-hero${hovering ? " hovering" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Zoom image"
        onPointerEnter={(e) => e.pointerType === "mouse" && setHovering(true)}
        onPointerMove={onHeroMove}
        onPointerLeave={() => setHovering(false)}
        onClick={() => setZoomed(active)}
        onKeyDown={(e) => e.key === "Enter" && setZoomed(active)}
      >
        <Image
          src={current.url}
          alt={current.alt}
          width={800}
          height={800}
          sizes="(min-width: 768px) 50vw, 100vw"
          priority
          style={{ transformOrigin: `${origin.x}% ${origin.y}%` }}
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

      {zoomed !== null && (
        <ZoomLightbox
          images={images}
          index={zoomed}
          onClose={() => setZoomed(null)}
          onNavigate={setZoomed}
        />
      )}
    </div>
  );
}
