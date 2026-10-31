import type { Metadata } from "next";
import { authConfigured } from "@/lib/supabase/config";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = {
  title: "Set your password",
  description: "Set the password for an account an administrator made for you.",
  robots: { index: false },
};

export default function WelcomePage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Set your password</h1>
        <WelcomeForm configured={authConfigured} />
      </div>
    </div>
  );
}
