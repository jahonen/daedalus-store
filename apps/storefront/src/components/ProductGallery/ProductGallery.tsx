"use client";

import { useState } from "react";
import Image from "next/image";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "./ProductGallery.scss";

export interface GalleryImage {
  url: string;
  alt: string;
}

/**
 * Lifecycle: beta — PDP image gallery.
 *
 * Full-size hero image on top; thumbnail strip underneath to switch.
 * Click/tap opens a yet-another-react-lightbox with native-feel
 * wheel/pinch/drag zoom (Zoom plugin) and a slide counter.
 */
export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  if (images.length === 0) {
    return <div className="product-media-placeholder" aria-hidden />;
  }

  const current = images[active];

  return (
    <div className="product-gallery">
      <div
        className="gallery-hero"
        role="button"
        tabIndex={0}
        aria-label="Zoom image"
        onClick={() => setLightboxIndex(active)}
        onKeyDown={(e) => e.key === "Enter" && setLightboxIndex(active)}
      >
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

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex >= 0 ? lightboxIndex : 0}
        slides={images.map((img) => ({ src: img.url, alt: img.alt }))}
        plugins={[Zoom, Counter]}
        zoom={{
          maxZoomPixelRatio: 3,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          scrollToZoom: true,
        }}
        animation={{ fade: 250, swipe: 400, zoom: 400 }}
        on={{ view: ({ index }) => setLightboxIndex(index) }}
      />
    </div>
  );
}
