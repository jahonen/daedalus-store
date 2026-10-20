"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@daedalus/shared";
import "./ProductCarousel.scss";

export interface CarouselProduct {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  salePriceCents: number | null;
  imageUrl: string | null;
  imageAlt: string;
}

/** Lifecycle: beta — snap-scroll product rail with arrow controls. */
export function ProductCarousel({ products }: { products: CarouselProduct[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function syncEnds() {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }

  useEffect(() => {
    syncEnds();
    window.addEventListener("resize", syncEnds);
    return () => window.removeEventListener("resize", syncEnds);
  }, []);

  function nudge(dir: -1 | 1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: "smooth" });
  }

  return (
    <section id="products" className="product-carousel" aria-label="Products">
      <div className="carousel-head">
        <h2 className="carousel-title">The collection</h2>
        <div className="carousel-nav">
          <button
            type="button"
            aria-label="Previous products"
            disabled={atStart}
            onClick={() => nudge(-1)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next products"
            disabled={atEnd}
            onClick={() => nudge(1)}
          >
            →
          </button>
        </div>
      </div>

      <div
        className="carousel-track"
        ref={trackRef}
        onScroll={syncEnds}
        role="list"
      >
        {products.map((p) => {
          const sale = p.salePriceCents;
          const onSale = sale != null;
          return (
            <Link
              key={p.id}
              role="listitem"
              href={`/products/${p.slug}`}
              className="product-tile"
            >
              <div className="product-tile-media">
                {p.imageUrl ? (
                  <Image
                    src={p.imageUrl}
                    alt={p.imageAlt || p.name}
                    width={640}
                    height={640}
                    sizes="(max-width: 768px) 78vw, 320px"
                  />
                ) : (
                  <div className="product-tile-placeholder" aria-hidden />
                )}
              </div>
              <div className="product-tile-info">
                <span className="product-tile-name">{p.name}</span>
                <span className="product-tile-price">
                  {onSale && <span className="sale">{formatEur(sale)}</span>}
                  <span className={onSale ? "base struck" : "base"}>
                    {formatEur(p.priceCents)}
                  </span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
