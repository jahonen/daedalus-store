import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CheckoutCancel() {
  return (
    <section className="block">
      <div className="block-inner">
        <h1 className="block-headline">Checkout cancelled</h1>
        <p className="block-body">
          No payment was taken and your reserved items were released.
        </p>
        <Link href="/">Back to store</Link>
      </div>
    </section>
  );
}
