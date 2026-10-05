import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { PlannedTape } from "@/components/tape";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Sign in for park staff and researchers.",
};

// Only a picture of the form for now. A real form comes with Supabase Auth
// (items 2 and 15), so there are no inputs here that could take a password.
function SkeletonField({ label }: { label: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-pencil">{label}</p>
      <div className="mt-1.5 h-11 rounded-lg border border-dashed border-pencil/50 bg-paper/60" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="card relative p-6 pt-8 sm:p-8 sm:pt-10">
        <PlannedTape
          items={[2, 15]}
          className="absolute left-4 top-0 -translate-y-1/2 -rotate-1"
        />
        <h1 className="text-2xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-moss">
          For park staff and researchers. Accounts are made by an
          administrator, so there’s no sign up.
        </p>

        <div aria-hidden="true" className="mt-6 space-y-4">
          <SkeletonField label="Email" />
          <SkeletonField label="Password" />
          <div className="flex h-11 items-center justify-center rounded-lg bg-line text-sm font-bold text-pencil">
            Sign in
          </div>
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <p className="flex gap-2.5 text-sm text-moss">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              Sign in isn’t built yet. For the demo, the button below opens
              the dashboard as Mira Tan, a made-up conservation officer.
            </span>
          </p>
          <Link href="/dashboard" className="btn btn-primary mt-4 w-full">
            Open the demo dashboard
            <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
