"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import { normaliseTag } from "@/lib/tags";

export function TagLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  // How many times in a row a bad code was sent, so the error is put back in
  // the page and read out again each time, not just the first
  const [badTries, setBadTries] = useState(0);
  const invalid = badTries > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normaliseTag(value);
    if (!code) {
      setBadTries((tries) => tries + 1);
      document.getElementById("tag-code")?.focus();
      return;
    }
    setBadTries(0);
    router.push(`/tag/${code}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8">
      <label htmlFor="tag-code" className="font-bold">
        Tag code
      </label>
      <p id="tag-code-hint" className="text-sm text-moss">
        It’s stamped under the QR code, like NNP-3F2A9C.
      </p>
      {invalid && (
        <p
          key={badTries}
          id="tag-code-error"
          role="alert"
          className="mt-2 flex items-start gap-2 text-sm font-bold text-bad"
        >
          <Icon name="alert" className="mt-px size-4" />
          Tag codes look like NNP-3F2A9C: NNP and then 6 letters or numbers.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <input
          id="tag-code"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={
            invalid ? "tag-code-hint tag-code-error" : "tag-code-hint"
          }
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="NNP-"
          className="field min-w-0 flex-1 font-mono text-lg uppercase tracking-[0.06em]"
        />
        <button type="submit" className="btn btn-primary">
          Look it up
        </button>
      </div>
    </form>
  );
}
