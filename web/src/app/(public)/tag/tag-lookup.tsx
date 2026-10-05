"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import { normaliseTag } from "@/lib/tags";

export function TagLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normaliseTag(value);
    if (!code) {
      setInvalid(true);
      document.getElementById("tag-code")?.focus();
      return;
    }
    setInvalid(false);
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
          id="tag-code-error"
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
