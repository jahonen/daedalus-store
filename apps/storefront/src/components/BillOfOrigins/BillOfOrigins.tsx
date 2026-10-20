"use client";

import { useRef, useState } from "react";
import type { MaterialEntry } from "@daedalus/shared";
import "./BillOfOrigins.scss";

/** Collapsible bill-of-materials origin table. Collapsed by default; emits analytics on expand. */
export function BillOfOrigins({ materials }: { materials: MaterialEntry[] }) {
  const [open, setOpen] = useState(false);
  const tracked = useRef(false);

  function toggle() {
    if (!open && !tracked.current) {
      tracked.current = true;
      // Emit analytics event (non-blocking).
      if (typeof window !== "undefined" && "gtag" in window) {
        (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
          "event",
          "bill_of_origins_expand",
        );
      }
    }
    setOpen(!open);
  }

  if (!materials.length) return null;

  return (
    <div className="bill-of-origins">
      <button
        className="boo-toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        <span>Bill of Origins</span>
        <span className={`boo-chevron ${open ? "open" : ""}`}>&#9660;</span>
      </button>
      {open && (
        <table className="boo-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Origin</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m, i) => (
              <tr key={i}>
                <td>{m.material}</td>
                <td>{m.origin}{m.supplier ? ` (${m.supplier})` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
