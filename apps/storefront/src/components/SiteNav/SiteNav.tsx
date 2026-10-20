"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./SiteNav.scss";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/heritage", label: "Heritage" },
  { href: "/#products", label: "Store" },
];

/**
 * Lifecycle: beta — site navigation.
 * Desktop: inline links in the header. Mobile: hamburger toggles a
 * full-width overlay; closes on route change, Esc, or backdrop tap.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Desktop inline nav */}
      <nav className="site-nav-inline" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger */}
      <button
        className={`nav-toggle${open ? " open" : ""}`}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span />
        <span />
        <span />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="nav-overlay" role="dialog" aria-modal="true">
          <button className="nav-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
          <nav className="nav-panel" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
