"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { MIN_PASSWORD, passwordProblem } from "@/lib/users";
import { setPassword, type SetPasswordResult } from "./actions";

type Found =
  | { status: "reading" }
  | { status: "problem"; message: string }
  | { status: "ready"; accessToken: string; refreshToken: string; email: string };

const NO_LINK =
  "This page only works from the link in your email. Open the email again, or ask an administrator to send a new one.";

/** The email inside a sign in's JWT, for the page and for password managers */
function emailFrom(accessToken: string) {
  try {
    const part = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(part)).email ?? "");
  } catch {
    return "";
  }
}

/** Supabase puts what the link did after the # in the address */
function readLink(hash: string): Found {
  const values = new URLSearchParams(hash.replace(/^#/, ""));
  const code = values.get("error_code");
  if (code === "otp_expired") {
    return {
      status: "problem",
      message:
        "This link has run out or has been used. Ask an administrator to send you a new one.",
    };
  }
  if (code || values.get("error")) {
    return {
      status: "problem",
      message: "This link didn’t work. Ask an administrator to send you a new one.",
    };
  }
  const accessToken = values.get("access_token");
  const refreshToken = values.get("refresh_token");
  const type = values.get("type");
  if (!accessToken || !refreshToken || (type !== "invite" && type !== "recovery")) {
    return { status: "problem", message: NO_LINK };
  }
  return { status: "ready", accessToken, refreshToken, email: emailFrom(accessToken) };
}

export function WelcomeForm({ configured }: { configured: boolean }) {
  const [found, setFound] = useState<Found>({ status: "reading" });
  const [password, setPasswordValue] = useState("");
  const [again, setAgain] = useState("");
  const [result, setResult] = useState<SetPasswordResult | null>(null);
  const [pending, startTransition] = useTransition();

  // What's after the # never reaches a server, so only the page can read it.
  // Then it comes out of the address, so it isn't left in the browser's history.
  // React can run this twice in a row, and the second time the # is gone.
  const linkRead = useRef(false);
  useEffect(() => {
    if (linkRead.current) return;
    linkRead.current = true;
    const link = readLink(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    setFound(link);
  }, []);

  if (found.status === "reading") {
    return <p className="mt-2 text-moss">Reading your link…</p>;
  }
  if (found.status === "problem" || !configured) {
    return (
      <p role="alert" className="mt-4 flex gap-2.5 text-sm font-bold text-bad">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        {found.status === "problem"
          ? found.message
          : "Accounts aren’t set up on this server yet."}
      </p>
    );
  }
  if (result?.ok) {
    return (
      <div className="mt-2">
        <p role="status" className="flex gap-2.5 font-bold text-ok">
          <Icon name="check" className="mt-0.5 size-5 shrink-0" />
          {result.message}
        </p>
        <p className="mt-3 text-moss">
          Field teams can now sign in on the phone app with this email and
          password. Conservation officers and administrators can use the staff
          sign in.
        </p>
        <Link href="/login" className="btn btn-primary mt-5 w-full">
          Go to staff sign in
        </Link>
      </div>
    );
  }

  const ready = found;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, again);
    if (problem) {
      setResult({ ok: false, message: problem });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const answer = await setPassword({
        accessToken: ready.accessToken,
        refreshToken: ready.refreshToken,
        password,
        again,
      }).catch(() => ({
        ok: false,
        message: "The server didn’t answer, so your password wasn’t saved. Check your connection and try again.",
      }));
      setResult(answer);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-4">
      <p className="text-moss">
        {ready.email ? `For ${ready.email}. ` : ""}Use at least {MIN_PASSWORD}{" "}
        characters, and don’t use one you use anywhere else.
      </p>
      {/* So a password manager saves it under the right email */}
      <input
        type="email"
        name="email"
        autoComplete="username"
        value={ready.email}
        readOnly
        hidden
      />
      <div>
        <label htmlFor="new-password" className="text-sm font-bold">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPasswordValue(event.target.value)}
          className="field mt-1.5 w-full"
        />
      </div>
      <div>
        <label htmlFor="new-password-again" className="text-sm font-bold">
          New password again
        </label>
        <input
          id="new-password-again"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          className="field mt-1.5 w-full"
        />
      </div>

      {result && (
        <p role="alert" className="flex gap-2.5 text-sm font-bold text-bad">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          {result.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
