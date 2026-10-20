"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryImage } from "../ProductGallery/ProductGallery";
import "./ZoomLightbox.scss";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

/** Clamp translation so the image can't drift fully out of view. */
function clampPan(t: Transform, viewport: { w: number; h: number }, base: { w: number; h: number }): Transform {
  const scaledW = base.w * t.scale;
  const scaledH = base.h * t.scale;
  const maxX = Math.max(0, (scaledW - viewport.w) / 2) + 80;
  const maxY = Math.max(0, (scaledH - viewport.h) / 2) + 80;
  return { ...t, x: Math.min(maxX, Math.max(-maxX, t.x)), y: Math.min(maxY, Math.max(-maxY, t.y)) };
}

/**
 * Fullscreen image zoom: wheel to zoom (cursor-anchored), drag to pan,
 * two-finger pinch on touch, double-click toggles, Esc closes,
 * arrows switch image.
 */
export function ZoomLightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; t: Transform } | null>(null);
  const imgSize = useRef({ w: 0, h: 0 });

  const reset = useCallback(() => {
    setT({ scale: 1, x: 0, y: 0 });
    pointers.current.clear();
    pinch.current = null;
  }, []);

  // Reset transform when the image changes; Esc / arrows key handling.
  useEffect(reset, [index, reset]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && images.length > 1)
        onNavigate((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight" && images.length > 1)
        onNavigate((index + 1) % images.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? null;
  }

  /** Zoom anchored at a client-space point (falls back to stage center). */
  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setT((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      if (next === prev.scale) return prev;
      const rect = stageRect();
      if (!rect) return { ...prev, scale: next, x: 0, y: 0 };
      const px = (cx ?? rect.width / 2 + rect.left) - rect.left - rect.width / 2;
      const py = (cy ?? rect.height / 2 + rect.top) - rect.top - rect.height / 2;
      const ratio = next / prev.scale;
      const x = px - (px - prev.x) * ratio;
      const y = py - (py - prev.y) * ratio;
      return clampPan(
        { scale: next, x, y },
        { w: rect.width, h: rect.height },
        imgSize.current,
      );
    });
  }, []);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
  }

  function onDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (t.scale > 1) reset();
    else zoomAt(2.5, e.clientX, e.clientY);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        t,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = dist / pinch.current.dist;
      const start = pinch.current.t;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * factor));
      const rect = stageRect();
      if (!rect) return;
      const midX = (a.x + b.x) / 2 - rect.left - rect.width / 2;
      const midY = (a.y + b.y) / 2 - rect.top - rect.height / 2;
      const ratio = next / start.scale;
      setT(
        clampPan(
          {
            scale: next,
            x: midX - (midX - start.x) * ratio,
            y: midY - (midY - start.y) * ratio,
          },
          { w: rect.width, h: rect.height },
          imgSize.current,
        ),
      );
    } else if (pointers.current.size === 1 && t.scale > 1) {
      setT((prev2) =>
        clampPan(
          { ...prev2, x: prev2.x + (e.clientX - prev.x), y: prev2.y + (e.clientY - prev.y) },
          { w: stageRect()?.width ?? 0, h: stageRect()?.height ?? 0 },
          imgSize.current,
        ),
      );
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  const img = images[index];

  return (
    <div className="zoom-overlay" role="dialog" aria-modal="true" aria-label="Image zoom">
      <button className="zoom-backdrop" aria-label="Close zoom" onClick={onClose} />
      <button className="zoom-close" aria-label="Close" onClick={onClose}>×</button>
      {images.length > 1 && (
        <>
          <button
            className="zoom-arrow zoom-prev"
            aria-label="Previous image"
            onClick={() => onNavigate((index - 1 + images.length) % images.length)}
          >‹</button>
          <button
            className="zoom-arrow zoom-next"
            aria-label="Next image"
            onClick={() => onNavigate((index + 1) % images.length)}
          >›</button>
        </>
      )}
      <div
        ref={stageRef}
        className="zoom-stage"
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- raw file for max zoom fidelity */}
        <img
          src={img.url}
          alt={img.alt}
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            imgSize.current = { w: el.clientWidth, h: el.clientHeight };
          }}
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
            cursor: t.scale > 1 ? "grab" : "zoom-in",
          }}
        />
      </div>
      <div className="zoom-counter">
        {index + 1} / {images.length}
      </div>
    </div>
  );
}
