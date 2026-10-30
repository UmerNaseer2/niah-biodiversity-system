"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icon";
import { signIn, type SignInState } from "./actions";

const INITIAL: SignInState = { error: null, email: "" };

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-bold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          required
          disabled={!configured}
          className="field mt-1.5 w-full"
        />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-bold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured}
          className="field mt-1.5 w-full"
        />
      </div>

      {state.error && (
        <p role="alert" className="flex gap-2.5 text-sm font-bold text-bad">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!configured || pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
