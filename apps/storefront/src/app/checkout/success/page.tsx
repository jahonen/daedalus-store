import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CheckoutSuccess() {
  return (
    <section className="block">
      <div className="block-inner">
        <h1 className="block-headline">Thank you for your order</h1>
        <p className="block-body">
          Payment confirmed. You will receive an order confirmation and shipping
          details by email.
        </p>
        <Link href="/">Back to store</Link>
      </div>
    </section>
  );
}
