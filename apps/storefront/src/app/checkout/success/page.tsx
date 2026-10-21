import type { Metadata } from "next";
import Link from "next/link";
import { NewsletterSignup } from "@/components/NewsletterSignup/NewsletterSignup";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CheckoutSuccess() {
  return (
    <section className="block">
      <div className="block-inner">
        <h1 className="block-headline">Thank you for your order</h1>
        <p className="block-body">
          Your checkout has been received. Once payment is confirmed, we will
          email your order confirmation and later your shipping details.
        </p>
        <Link href="/">Back to store</Link>
        <NewsletterSignup source="checkout" />
      </div>
    </section>
  );
}
