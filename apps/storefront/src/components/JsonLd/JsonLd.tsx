/** Emits a JSON-LD script tag for GEO/SEO entity modeling. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Escape `</script>` sequences to prevent XSS in user-controlled fields.
  const html = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
