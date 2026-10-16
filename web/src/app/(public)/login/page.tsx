import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { authConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Sign in for park staff and botanists.",
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-moss">
          For conservation officers and administrators. Accounts are made by
          an administrator, so there’s no sign up.
        </p>

        <LoginForm configured={authConfigured} />

        {!authConfigured && (
          <p className="mt-6 flex gap-2.5 border-t border-line pt-6 text-sm text-moss">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              Sign in isn’t set up on this server. Add the Supabase values to{" "}
              <code>.env.local</code> and restart.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
