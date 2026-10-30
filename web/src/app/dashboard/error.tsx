"use client";

import Link from "next/link";

// Shown inside the staff layout when a dashboard page can't load, for example
// when Supabase doesn't answer. Like the public one (app/(public)/error.tsx),
// it doesn't print the error, since a production build swaps the message for
// a code anyway. The code is in the server log.
export default function DashboardError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="max-w-xl py-8">
      <title>This page didn’t load · Staff · Niah Plant Records</title>
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">This page didn’t load</h1>
      <p className="mt-3 text-moss">
        It’s a problem on our side, like the database not answering. Try again in a moment, and if
        it keeps happening, let an administrator know.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-secondary">
          Go to the overview
        </Link>
      </div>
    </div>
  );
}
