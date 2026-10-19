import { bucket } from "../admin.js";

/** Build a public Firebase Storage download URL for a file under public/. */
export function publicUrlFor(path: string): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(path)}?alt=media`
  );
}
