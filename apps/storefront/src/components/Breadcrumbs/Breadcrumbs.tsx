import Link from "next/link";
import { breadcrumbLd } from "@/lib/jsonld";
import { JsonLd } from "../JsonLd/JsonLd";
import "./Breadcrumbs.scss";

export interface Crumb {
  label: string;
  href?: string;
}

/** Lifecycle: beta — editorial navigation trail + BreadcrumbList rich data. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <JsonLd data={breadcrumbLd(items)} />
      <ol>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} aria-current={last ? "page" : undefined}>
              {c.href && !last ? (
                <Link href={c.href}>{c.label}</Link>
              ) : (
                <span>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
