import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

const TAGS = new Set(["pages", "products", "campaigns", "prices", "company", "media"]);

/** Called by backend processes after content changes; token-gated. */
export async function POST(request: Request) {
  const token = request.headers.get("x-revalidate-token");
  if (!process.env.REVALIDATE_TOKEN || token !== process.env.REVALIDATE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { tag } = (await request.json().catch(() => ({}))) as { tag?: string };
  const tags = tag && TAGS.has(tag) ? [tag] : [...TAGS];
  for (const t of tags) revalidateTag(t, "max");
  return NextResponse.json({ revalidated: tags });
}
