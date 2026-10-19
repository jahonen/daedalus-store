"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="block" style={{ textAlign: "center", padding: "6rem 1.5rem" }}>
      <h1 className="block-headline" style={{ fontSize: "2.4rem" }}>
        Something went wrong
      </h1>
      <p className="block-body">
        We hit an unexpected error. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: "1.5rem",
          padding: "0.75rem 2rem",
          background: "#1c1c1e",
          color: "#fff",
          border: "none",
          borderRadius: "12px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "1rem",
        }}
      >
        Try again
      </button>
    </section>
  );
}
