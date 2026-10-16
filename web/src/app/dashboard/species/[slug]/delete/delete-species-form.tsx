"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Icon } from "@/components/icon";
import { deleteSpecies, type DeleteSpeciesState } from "../../actions";

const INITIAL: DeleteSpeciesState = { status: "idle" };

export function DeleteSpeciesForm({ slug }: { slug: string }) {
  // Deleting sends the page to the species list, so only a problem comes back
  const [state, formAction, pending] = useActionState(deleteSpecies, INITIAL);
  const [handled, setHandled] = useState(state);
  const [focusRequest, setFocusRequest] = useState<object | null>(null);

  // A new answer from the server, picked up while rendering like the species
  // form does
  if (state !== handled) {
    setHandled(state);
    if (state.status === "error") setFocusRequest({});
  }

  useEffect(() => {
    if (focusRequest) document.getElementById("delete-error")?.focus();
  }, [focusRequest]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // With JavaScript the form is sent from here, only once at a time
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="mt-6 border-t border-line pt-6"
    >
      {state.status === "error" && (
        <p
          id="delete-error"
          tabIndex={-1}
          className="mb-5 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      )}
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={pending} className="btn btn-danger">
          {pending ? "Deleting…" : "Delete species"}
        </button>
        <Link href="/dashboard/species" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
      <p role="status" className="sr-only">
        {pending ? "Deleting the species." : ""}
      </p>
    </form>
  );
}
