"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import {
  ConditionBadge,
  HiddenLocationBadge,
  IucnChip,
  LatinName,
} from "@/components/plant-bits";
import type { Condition } from "@/lib/condition";
import { plural } from "@/lib/format";
import type { IucnCode } from "@/lib/iucn";
import { MAX_REASON, REASON_MISSING, tidyReason, type Decision } from "@/lib/review";
import { reviewRecord } from "./actions";

export type ReviewItem = {
  id: string;
  /** The record's updated_at as sent, so a decision only applies to what was shown */
  version: string;
  code: string;
  /** The common name when the species is on our list, otherwise what the field team typed */
  speciesName: string;
  scientificName: string;
  /** The name on the record, only if it's a different plant from the linked species */
  nameDisagreesWith: string | null;
  /** A common name the ranger typed, only if we don't have it for this species */
  newCommonName: string | null;
  /** Null while the plant isn't matched to a species yet */
  iucn: IucnCode | null;
  hidesLocation: boolean;
  heightM: number | null;
  condition: Condition;
  photoCount: number;
  coords: string | null;
  accuracyM: number | null;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
  status: "waiting" | "published" | "rejected";
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

// Phone GPS under the canopy is often off by 10 m or more. Past this we
// flag it so the officer looks at the point before approving.
const GOOD_GPS_M = 15;

function checksFor(item: ReviewItem) {
  const checks: { ok: boolean; text: string }[] = [];
  if (item.nameDisagreesWith) {
    checks.push({
      ok: false,
      text:
        `The record says “${item.nameDisagreesWith}” but it’s linked to ` +
        `${item.scientificName}. Fix the name before you approve it, since the ` +
        "link decides how much of its spot the public sees",
    });
  }
  if (item.newCommonName) {
    checks.push({
      ok: false,
      text:
        `The ranger typed the common name “${item.newCommonName}”, which we don’t ` +
        "have for this species. It shows on the public page",
    });
  }
  if (item.accuracyM === null) {
    checks.push({ ok: false, text: "No GPS point, so it won’t show on any map" });
  } else if (item.accuracyM <= GOOD_GPS_M) {
    checks.push({ ok: true, text: `GPS is accurate to ±${item.accuracyM} m` });
  } else {
    checks.push({
      ok: false,
      text: `GPS is only accurate to ±${item.accuracyM} m, check the point`,
    });
  }
  checks.push(
    item.photoCount > 0
      ? { ok: true, text: `${plural(item.photoCount, "photo")} attached` }
      : { ok: false, text: "No photos attached" },
  );
  checks.push(
    item.iucn
      ? { ok: true, text: "Matched to a species on our list" }
      : {
          ok: false,
          text: "Not matched to a species yet, so the public site only shows a rough area",
        },
  );
  return checks;
}

export function ReviewQueue({
  waiting,
  decided,
}: {
  waiting: ReviewItem[];
  decided: ReviewItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(
    null,
  );

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  function clearError(id: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function decide(item: ReviewItem, decision: Decision, why = "") {
    if (isPending) return;
    clearError(item.id);
    setBusy(item.id);
    startTransition(async () => {
      // A request that never comes back throws, and a transition would hand
      // that to the error page, wiping any reason typed in. Trying again is
      // safe: if the first one did save, the version check says so.
      const result = await reviewRecord({
        id: item.id,
        version: item.version,
        decision,
        reason: why,
      }).catch(() => ({
        ok: false as const,
        message:
          "The server didn’t answer, so your decision may not have saved. " +
          "Check your connection and try again.",
      }));
      setBusy(null);
      if (!result.ok) {
        setErrors((current) => ({ ...current, [item.id]: result.message }));
        setFocusRequest({ elementId: `error-${item.id}` });
        return;
      }
      setRejecting(null);
      setReason("");
      setReasonError(null);
      setAnnouncement(
        decision === "approve"
          ? `Approved ${item.speciesName}, ${item.code}.`
          : decision === "reject"
            ? `Rejected ${item.speciesName}, ${item.code}.`
            : `${item.speciesName}, ${item.code}, is back in the queue.`,
      );
      // The page refreshes with the record in its new place, so land on the
      // heading of the queue rather than on a card that has just moved
      setFocusRequest({ elementId: "pending-heading" });
    });
  }

  function startRejecting(item: ReviewItem) {
    setRejecting(item.id);
    setReason("");
    setReasonError(null);
    clearError(item.id);
    setFocusRequest({ elementId: `reason-${item.id}` });
  }

  function cancelRejecting(item: ReviewItem) {
    setRejecting(null);
    setReasonError(null);
    setFocusRequest({ elementId: `reject-${item.id}` });
  }

  function submitReject(event: FormEvent<HTMLFormElement>, item: ReviewItem) {
    event.preventDefault();
    const text = tidyReason(reason);
    if (!text) {
      setReasonError(REASON_MISSING);
      document.getElementById(`reason-${item.id}`)?.focus();
      return;
    }
    if (text.length > MAX_REASON) {
      setReasonError(`The reason can be up to ${MAX_REASON} characters.`);
      document.getElementById(`reason-${item.id}`)?.focus();
      return;
    }
    setReasonError(null);
    decide(item, "reject", text);
  }

  return (
    <>
      <p role="status" className="sr-only">
        {isPending ? "Saving your decision." : announcement}
      </p>

      <section aria-labelledby="pending-heading" className="mt-10">
        <h2
          id="pending-heading"
          tabIndex={-1}
          className="text-xl font-bold tracking-tight"
        >
          Waiting{" "}
          <span className="font-normal text-moss">({waiting.length})</span>
        </h2>

        {waiting.length === 0 ? (
          <div className="card mt-4 flex items-center gap-4 p-5 sm:p-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
              <Icon name="check" />
            </span>
            <div>
              <h3 className="font-bold">Nothing left to review</h3>
              <p className="text-sm text-moss">
                New records from the mobile app will show up here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-5">
            {waiting.map((item) => (
              <li key={item.id}>
                <article
                  aria-labelledby={`item-${item.id}`}
                  className="card overflow-hidden"
                >
                  <div className="p-4 sm:p-6">
                    <p className="font-mono text-sm font-bold text-moss">
                      {item.code}
                    </p>
                    <h3
                      id={`item-${item.id}`}
                      tabIndex={-1}
                      className="text-2xl font-bold tracking-tight"
                    >
                      {item.speciesName}
                    </h3>
                    <p>
                      <LatinName name={item.scientificName} />
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.iucn && <IucnChip code={item.iucn} />}
                      {item.hidesLocation && <HiddenLocationBadge />}
                    </div>

                    <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <dt className="text-moss">Height</dt>
                        <dd className="font-bold">
                          {item.heightM === null ? "Not measured" : `${item.heightM} m`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-moss">Condition</dt>
                        <dd className="mt-0.5">
                          <ConditionBadge condition={item.condition} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-moss">Photos</dt>
                        <dd className="font-bold">
                          {item.photoCount > 0
                            ? plural(item.photoCount, "photo")
                            : "None"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-moss">GPS point</dt>
                        <dd className="font-mono font-bold">
                          {item.coords ?? "None"}
                          {item.accuracyM !== null && (
                            <>
                              {" "}
                              <span className="whitespace-nowrap font-sans font-normal text-moss">
                                ±{item.accuracyM} m
                              </span>
                            </>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-moss">Recorded by</dt>
                        <dd className="font-bold">{item.recordedBy}</dd>
                      </div>
                      <div>
                        <dt className="text-moss">Recorded</dt>
                        <dd className="font-bold">{item.recordedAt}</dd>
                      </div>
                    </dl>

                    {item.notes && (
                      <figure className="mt-5 border-l-4 border-line pl-4">
                        <figcaption className="text-sm text-moss">
                          Ranger’s note
                        </figcaption>
                        <blockquote className="whitespace-pre-line">{item.notes}</blockquote>
                      </figure>
                    )}

                    {item.reviewNotes && (
                      <figure className="mt-5 border-l-4 border-warn pl-4">
                        <figcaption className="text-sm text-moss">
                          Earlier review note
                          {item.reviewedBy && <>, from {item.reviewedBy}</>}
                        </figcaption>
                        <blockquote className="whitespace-pre-line">{item.reviewNotes}</blockquote>
                      </figure>
                    )}

                    <ul className="mt-5 space-y-1.5 text-sm">
                      {checksFor(item).map((check) => (
                        <li key={check.text} className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
                              check.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
                            }`}
                          >
                            <Icon
                              name={check.ok ? "check" : "alert"}
                              className="size-3"
                            />
                          </span>
                          <span>
                            <span className="sr-only">
                              {check.ok ? "Looks fine: " : "Check this: "}
                            </span>
                            {check.text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <p className="mt-4 text-sm">
                      <Link
                        href={`/dashboard/records/${item.id}/edit`}
                        className="font-bold underline decoration-line underline-offset-4 hover:decoration-ink"
                      >
                        Open the record
                        <span className="sr-only"> {item.code}</span>
                      </Link>{" "}
                      <span className="text-moss">
                        to see its photos or fix a mistake before you decide.
                      </span>
                    </p>
                  </div>

                  <div className="border-t border-line bg-paper/60 p-4 sm:px-6">
                    {errors[item.id] && (
                      <p
                        id={`error-${item.id}`}
                        tabIndex={-1}
                        role="alert"
                        className="mb-4 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
                      >
                        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                        {errors[item.id]}
                      </p>
                    )}
                    {rejecting === item.id ? (
                      <form
                        onSubmit={(event) => submitReject(event, item)}
                        noValidate
                      >
                        <label htmlFor={`reason-${item.id}`} className="font-bold">
                          Why are you rejecting it?
                        </label>
                        <p id={`reason-${item.id}-hint`} className="text-sm text-moss">
                          It’s saved with the record, so say what to fix.
                        </p>
                        {reasonError && (
                          <p
                            id={`reason-${item.id}-error`}
                            className="mt-1 flex items-start gap-2 text-sm font-bold text-bad"
                          >
                            <Icon name="alert" className="mt-px size-4" />
                            {reasonError}
                          </p>
                        )}
                        <textarea
                          id={`reason-${item.id}`}
                          rows={3}
                          value={reason}
                          onChange={(event) => {
                            setReason(event.target.value);
                            setReasonError(null);
                          }}
                          aria-invalid={Boolean(reasonError)}
                          aria-describedby={
                            reasonError
                              ? `reason-${item.id}-hint reason-${item.id}-error`
                              : `reason-${item.id}-hint`
                          }
                          className="field mt-2"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="submit"
                            aria-disabled={isPending}
                            className="btn btn-danger"
                          >
                            {busy === item.id ? "Rejecting…" : "Reject record"}
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelRejecting(item)}
                            className="btn btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          aria-disabled={isPending}
                          onClick={() => decide(item, "approve")}
                          className="btn btn-primary"
                        >
                          <Icon name="check" className="size-4" />
                          {busy === item.id ? "Approving…" : "Approve"}
                          <span className="sr-only">
                            {" "}
                            {item.speciesName} {item.code}
                          </span>
                        </button>
                        <button
                          id={`reject-${item.id}`}
                          type="button"
                          aria-disabled={isPending}
                          onClick={() => startRejecting(item)}
                          className="btn btn-danger"
                        >
                          <Icon name="x" className="size-4" />
                          Reject
                          <span className="sr-only">
                            {" "}
                            {item.speciesName} {item.code}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section aria-labelledby="decided-heading" className="mt-12">
          <h2 id="decided-heading" className="text-xl font-bold tracking-tight">
            Recently reviewed
          </h2>
          <p className="mt-1 text-sm text-moss">
            The last {plural(decided.length, "decision")}. If one was a mistake,
            send the record back to the queue and decide again.
          </p>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
            {decided.map((item) => {
              const approved = item.status === "published";
              return (
                <li key={item.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        approved ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"
                      }`}
                    >
                      {approved ? "Approved" : "Rejected"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {item.speciesName}{" "}
                        <span className="font-mono text-sm text-moss">
                          {item.code}
                        </span>
                      </p>
                      <p className="text-sm text-moss">
                        {item.reviewedBy ?? "Someone"}
                        {item.reviewedAt && <>, {item.reviewedAt}</>}
                        {!approved && item.reviewNotes && (
                          <> · Reason: {item.reviewNotes}</>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/records/${item.id}/edit`}
                        className="btn btn-secondary"
                      >
                        Open
                        <span className="sr-only"> {item.code}</span>
                      </Link>
                      <button
                        type="button"
                        aria-disabled={isPending}
                        onClick={() => decide(item, "reopen")}
                        className="btn btn-secondary"
                      >
                        <Icon name="undo" className="size-4" />
                        {busy === item.id ? "Sending back…" : "Back to the queue"}
                        <span className="sr-only">
                          {" "}
                          {item.speciesName} {item.code}
                        </span>
                      </button>
                    </div>
                  </div>
                  {errors[item.id] && (
                    <p
                      id={`error-${item.id}`}
                      tabIndex={-1}
                      role="alert"
                      className="mt-3 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
                    >
                      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                      {errors[item.id]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
