"use client";

import Link from "next/link";
import { LogoMark } from "@/components/logo";

// Shown when something fails outside the public and staff pages' own error
// screens, like the staff layout checking who is signed in. It doesn't print
// the error, for the same reason as app/(public)/error.tsx.
export default function RootError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6"
    >
      <title>This page didn’t load · Niah Plant Records</title>
      <Link href="/" className="flex items-center gap-2.5 self-start rounded-md font-bold">
        <LogoMark />
        Niah Plant Records
      </Link>
      <p className="eyebrow mt-12">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">This page didn’t load</h1>
      <p className="mt-3 text-moss">
        It’s a problem on our side, like the database not answering. Try again in a moment.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
