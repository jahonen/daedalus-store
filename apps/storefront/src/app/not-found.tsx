import Link from "next/link";

export default function NotFound() {
  return (
    <section className="block" style={{ textAlign: "center", padding: "6rem 1.5rem" }}>
      <h1 className="block-headline" style={{ fontSize: "2.4rem" }}>
        404
      </h1>
      <p className="block-body">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          marginTop: "1.5rem",
          padding: "0.75rem 2rem",
          background: "#1c1c1e",
          color: "#fff",
          borderRadius: "12px",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Back to home
      </Link>
    </section>
  );
}
