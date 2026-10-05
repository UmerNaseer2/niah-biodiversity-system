"use client";

import { useEffect, useState, type FormEvent } from "react";
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

export type QueueItem = {
  id: string;
  code: string;
  speciesName: string;
  scientificName: string;
  iucn: IucnCode;
  hidesLocation: boolean;
  heightM: number;
  condition: Condition;
  photoCount: number;
  coords: string | null;
  accuracyM: number | null;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
};

type Decision = { kind: "approved" } | { kind: "rejected"; reason: string };

// Phone GPS under the canopy is often off by 10 m or more. Past this we
// flag it so the officer looks at the point before approving.
const GOOD_GPS_M = 15;

function checksFor(item: QueueItem) {
  const checks: { ok: boolean; text: string }[] = [];
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
  return checks;
}

export function ReviewQueue({ items }: { items: QueueItem[] }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonMissing, setReasonMissing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(
    null,
  );

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  const pending = items.filter((item) => !decisions[item.id]);
  const decided = items.filter((item) => decisions[item.id]);

  function decide(item: QueueItem, decision: Decision) {
    const index = pending.findIndex((p) => p.id === item.id);
    const rest = pending.filter((p) => p.id !== item.id);
    // Move on to the next record, or the "all done" message
    const next = rest[index] ?? rest[index - 1];

    setDecisions((current) => ({ ...current, [item.id]: decision }));
    setRejecting(null);
    setReason("");
    setReasonMissing(false);
    setAnnouncement(
      `${decision.kind === "approved" ? "Approved" : "Rejected"} ${item.speciesName}, ${item.code}.`,
    );
    setFocusRequest({ elementId: next ? `item-${next.id}` : "queue-clear" });
  }

  function startRejecting(item: QueueItem) {
    setRejecting(item.id);
    setReason("");
    setReasonMissing(false);
    setFocusRequest({ elementId: `reason-${item.id}` });
  }

  function cancelRejecting(item: QueueItem) {
    setRejecting(null);
    setReasonMissing(false);
    setFocusRequest({ elementId: `reject-${item.id}` });
  }

  function submitReject(event: FormEvent<HTMLFormElement>, item: QueueItem) {
    event.preventDefault();
    const text = reason.trim();
    if (!text) {
      setReasonMissing(true);
      document.getElementById(`reason-${item.id}`)?.focus();
      return;
    }
    decide(item, { kind: "rejected", reason: text });
  }

  function undo(item: QueueItem) {
    setDecisions((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setAnnouncement(`${item.speciesName}, ${item.code}, is back in the queue.`);
    setFocusRequest({ elementId: `item-${item.id}` });
  }

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <section aria-labelledby="pending-heading" className="mt-10">
        <h2 id="pending-heading" className="text-xl font-bold tracking-tight">
          Waiting{" "}
          <span className="font-normal text-moss">({pending.length})</span>
        </h2>

        {pending.length === 0 ? (
          <div className="card mt-4 flex items-center gap-4 p-5 sm:p-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
              <Icon name="check" />
            </span>
            <div>
              <h3 id="queue-clear" tabIndex={-1} className="font-bold">
                Nothing left to review
              </h3>
              <p className="text-sm text-moss">
                New records from the mobile app will show up here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-5">
            {pending.map((item) => (
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
                      <IucnChip code={item.iucn} />
                      {item.hidesLocation && <HiddenLocationBadge />}
                    </div>

                    <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <dt className="text-moss">Height</dt>
                        <dd className="font-bold">{item.heightM} m</dd>
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
                        <blockquote>{item.notes}</blockquote>
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
                  </div>

                  <div className="border-t border-line bg-paper/60 p-4 sm:px-6">
                    {rejecting === item.id ? (
                      <form
                        onSubmit={(event) => submitReject(event, item)}
                        noValidate
                      >
                        <label htmlFor={`reason-${item.id}`} className="font-bold">
                          Why are you rejecting it?
                        </label>
                        <p id={`reason-${item.id}-hint`} className="text-sm text-moss">
                          {item.recordedBy} will see this, so say what to fix.
                        </p>
                        {reasonMissing && (
                          <p
                            id={`reason-${item.id}-error`}
                            className="mt-1 flex items-start gap-2 text-sm font-bold text-bad"
                          >
                            <Icon name="alert" className="mt-px size-4" />
                            Write a reason so the ranger knows what to fix.
                          </p>
                        )}
                        <textarea
                          id={`reason-${item.id}`}
                          rows={3}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          aria-invalid={reasonMissing}
                          aria-describedby={
                            reasonMissing
                              ? `reason-${item.id}-hint reason-${item.id}-error`
                              : `reason-${item.id}-hint`
                          }
                          className="field mt-2"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="submit" className="btn btn-danger">
                            Reject record
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
                          onClick={() => decide(item, { kind: "approved" })}
                          className="btn btn-primary"
                        >
                          <Icon name="check" className="size-4" />
                          Approve
                          <span className="sr-only">
                            {" "}
                            {item.speciesName} {item.code}
                          </span>
                        </button>
                        <button
                          id={`reject-${item.id}`}
                          type="button"
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
            Done in this session
          </h2>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-sheet">
            {decided.map((item) => {
              const decision = decisions[item.id];
              const approved = decision.kind === "approved";
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4"
                >
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
                      {decision.kind === "rejected"
                        ? `Reason: ${decision.reason}`
                        : "Once this is saved for real, it goes on the public site."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => undo(item)}
                    className="btn btn-secondary"
                  >
                    <Icon name="undo" className="size-4" />
                    Undo
                    <span className="sr-only">
                      {" "}
                      {approved ? "approving" : "rejecting"} {item.speciesName}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
