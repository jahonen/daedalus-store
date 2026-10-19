"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import "./ProductGallery.scss";

export interface GalleryImage {
  url: string;
  alt: string;
}

/**
 * Lifecycle: beta — PDP image gallery.
 *
 * Shows all product images. If more images exist than fit in a single
 * viewport row, renders an infinite (wrapping) carousel with arrow
 * controls and dot indicators. Otherwise displays a static grid.
 */
export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [needsCarousel, setNeedsCarousel] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const count = images.length;

  // Detect whether images overflow the container.
  const checkOverflow = useCallback(() => {
    const el = trackRef.current;
    if (!el || count <= 1) { setNeedsCarousel(false); return; }
    setNeedsCarousel(el.scrollWidth > el.clientWidth + 4);
  }, [count]);

  useEffect(() => {
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [checkOverflow]);

  // Track which image is centered via scroll position.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !needsCarousel) return;
    function onScroll() {
      if (!el) return;
      const slideW = el.querySelector<HTMLElement>(".gallery-slide")?.offsetWidth;
      if (!slideW) return;
      const idx = Math.round(el.scrollLeft / slideW) % count;
      setActiveIdx(idx >= 0 ? idx : idx + count);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [needsCarousel, count]);

  /** Navigate: wraps around for infinite feel. */
  function go(dir: -1 | 1) {
    const el = trackRef.current;
    if (!el) return;
    const slideW = el.querySelector<HTMLElement>(".gallery-slide")?.offsetWidth;
    if (!slideW) return;
    const next = activeIdx + dir;
    // Wrap logic: snap to the clone region then silently reset.
    el.scrollBy({ left: dir * slideW, behavior: "smooth" });
    setActiveIdx(((next % count) + count) % count);
  }

  function goTo(idx: number) {
    const el = trackRef.current;
    if (!el) return;
    const slideW = el.querySelector<HTMLElement>(".gallery-slide")?.offsetWidth;
    if (!slideW) return;
    // In the tripled list, the "real" first set starts at offset `count`.
    const target = (count + idx) * slideW;
    el.scrollTo({ left: target, behavior: "smooth" });
    setActiveIdx(idx);
  }

  // For infinite scroll: triple the images so we can scroll in both
  // directions without hitting an edge. On scroll-end, silently snap
  // back to the middle copy.
  const infiniteImages = needsCarousel
    ? [...images, ...images, ...images]
    : images;

  // After a smooth scroll finishes, snap to the middle copy silently.
  useEffect(() => {
    if (!needsCarousel) return;
    const el = trackRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    function onScrollEnd() {
      if (!el) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const slideW = el.querySelector<HTMLElement>(".gallery-slide")?.offsetWidth;
        if (!slideW) return;
        const totalOneSet = count * slideW;
        // If scrolled into first or third copy, jump to the middle copy.
        if (el.scrollLeft < totalOneSet * 0.5 || el.scrollLeft >= totalOneSet * 2.5) {
          const currentInSet = el.scrollLeft % totalOneSet;
          el.scrollTo({ left: totalOneSet + currentInSet, behavior: "instant" });
        }
      }, 80);
    }
    el.addEventListener("scroll", onScrollEnd, { passive: true });
    return () => { el.removeEventListener("scroll", onScrollEnd); clearTimeout(timer); };
  }, [needsCarousel, count]);

  // On mount with infinite: start at the middle copy.
  useEffect(() => {
    if (!needsCarousel) return;
    const el = trackRef.current;
    if (!el) return;
    const slideW = el.querySelector<HTMLElement>(".gallery-slide")?.offsetWidth;
    if (!slideW) return;
    el.scrollTo({ left: count * slideW, behavior: "instant" });
  }, [needsCarousel, count]);

  if (count === 0) {
    return <div className="product-media-placeholder" aria-hidden />;
  }

  return (
    <div className={`product-gallery${needsCarousel ? " carousel-active" : ""}`}>
      <div
        className="gallery-track"
        ref={trackRef}
      >
        {infiniteImages.map((img, i) => (
          <div key={`${img.url}-${i}`} className="gallery-slide">
            <Image
              src={img.url}
              alt={img.alt}
              width={800}
              height={800}
              sizes="(min-width: 768px) 50vw, 100vw"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {needsCarousel && (
        <>
          <button
            type="button"
            className="gallery-arrow gallery-prev"
            aria-label="Previous image"
            onClick={() => go(-1)}
          >
            &#8249;
          </button>
          <button
            type="button"
            className="gallery-arrow gallery-next"
            aria-label="Next image"
            onClick={() => go(1)}
          >
            &#8250;
          </button>
          <div className="gallery-dots" role="tablist" aria-label="Image selector">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activeIdx}
                aria-label={`Image ${i + 1}`}
                className={`gallery-dot${i === activeIdx ? " active" : ""}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
