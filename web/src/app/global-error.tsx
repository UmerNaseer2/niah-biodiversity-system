"use client";

import Link from "next/link";
import "./globals.css";

// Only shown if the root layout itself fails. It takes the place of the whole
// page, so it brings its own <html>, <body> and styles. The fonts come from the
// root layout, so this falls back to the system ones.
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <title>This page didn’t load · Niah Plant Records</title>
        <main
          id="main"
          className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6"
        >
          <p className="eyebrow">Something went wrong</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">This page didn’t load</h1>
          <p className="mt-3 text-moss">It’s a problem on our side. Try again in a moment.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => retry()} className="btn btn-primary">
              Try again
            </button>
            <Link href="/" className="btn btn-secondary">
              Go to the home page
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
