"use client";

import Link from "next/link";

// Shown when a public page can't load its data, for example when Supabase
// doesn't answer. A production build swaps the real error message for a code
// before it reaches the browser, and we don't print either one here.
export default function PublicError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
      {/* React moves this into <head>. A plant or tag page that fails has no
          title otherwise, because its metadata needs the same data */}
      <title>This page didn’t load · Niah Plant Records</title>
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        This page didn’t load
      </h1>
      <p className="mt-3 text-moss">
        It’s a problem on our side, like the plant database not answering. Try
        again in a moment.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
