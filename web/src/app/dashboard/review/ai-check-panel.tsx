"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import {
  aiCheckPending,
  ANSWER_LABEL,
  VERDICT_LABEL,
  type AiAnswer,
  type AiCheck,
  type AiVerdict,
} from "@/lib/ai-check";
import { plural } from "@/lib/format";
import { useVisibleTimer } from "@/lib/use-visible-timer";
import { refreshReviewQueue, requestAiCheck } from "./actions";

const VERDICT_STYLE: Record<AiVerdict, { box: string; icon: "check" | "alert" | "info" }> = {
  consistent: { box: "bg-ok-soft text-ok", icon: "check" },
  worth_a_look: { box: "bg-warn-soft text-warn", icon: "alert" },
  unsure: { box: "bg-paper text-moss border border-line", icon: "info" },
};

const QUESTIONS: { key: "namesMatch" | "photoShowsPlant" | "photoMatchesName"; text: string }[] = [
  { key: "namesMatch", text: "The scientific and common names are the same plant" },
  { key: "photoShowsPlant", text: "The photo shows a plant" },
  { key: "photoMatchesName", text: "The plant in the photo looks like this species" },
];

const ANSWER_STYLE: Record<AiAnswer, string> = {
  yes: "text-ok",
  no: "text-warn",
  unsure: "text-moss",
};

/**
 * The AI photo check on one waiting record. It's a second opinion for the officer, nothing more:
 * it never approves or rejects anything, and the buttons below work the same whatever it says.
 */
export function AiCheckPanel({
  recordId,
  code,
  check,
}: {
  recordId: string;
  code: string;
  check: AiCheck;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const pending = aiCheckPending(check);

  function checkAgain() {
    if (isPending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await requestAiCheck(recordId).catch(() => ({
        ok: false as const,
        message: "The server didn’t answer, so the check may not have been sent. Try again.",
      }));
      if (!result.ok) setMessage(result.message);
    });
  }

  return (
    <section
      aria-labelledby={`ai-${recordId}`}
      className="mt-5 rounded-xl border border-line bg-paper/60 p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`ai-${recordId}`} className="flex items-center gap-2 font-bold">
          <Icon name="camera" className="size-4 shrink-0 text-moss" />
          AI photo check
          <span className="sr-only"> for {code}</span>
        </h4>
        {check.status === "done" && check.verdict && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold ${VERDICT_STYLE[check.verdict].box}`}
          >
            <Icon name={VERDICT_STYLE[check.verdict].icon} className="size-3.5" />
            {VERDICT_LABEL[check.verdict]}
          </span>
        )}
      </div>

      <div className="mt-2 space-y-2">
        <Body check={check} />
      </div>

      <p className="mt-3 text-xs text-moss">
        A second opinion from Google’s Gemini on the photos and names. It can be wrong, so the
        decision is still yours.
      </p>

      {!pending && check.status !== "unavailable" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={checkAgain}
            disabled={isPending}
            aria-describedby={message ? `ai-${recordId}-message` : undefined}
            className="btn btn-secondary"
          >
            {isPending
              ? "Sending…"
              : check.status === "not_checked"
                ? "Check now"
                : "Check again"}
          </button>
        </div>
      )}
      {message && (
        <p
          id={`ai-${recordId}-message`}
          role="alert"
          className="mt-2 flex items-start gap-2 font-bold text-warn"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {message}
        </p>
      )}
    </section>
  );
}

/** Something that went wrong, or that the officer should know, on the card */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 font-bold text-warn">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Body({ check }: { check: AiCheck }) {
  switch (check.status) {
    case "done":
      return (
        <>
          {check.note && <p>{check.note}</p>}
          {QUESTIONS.some((q) => check[q.key]) && (
            <dl className="space-y-1">
              {QUESTIONS.filter((q) => check[q.key]).map((q) => {
                const answer = check[q.key] as AiAnswer;
                return (
                  <div key={q.key} className="flex flex-wrap gap-x-2">
                    <dt className="text-moss">{q.text}:</dt>
                    <dd className={`font-bold ${ANSWER_STYLE[answer]}`}>{ANSWER_LABEL[answer]}</dd>
                  </div>
                );
              })}
            </dl>
          )}
          {check.warning && <Warning>{check.warning}</Warning>}
          {check.namesChanged && (
            <Warning>
              The names were changed after this check, so it was about the old ones. Check again
              to look at the new names.
            </Warning>
          )}
          <p className="text-moss">
            {check.photosChecked > 0
              ? `Looked at ${plural(check.photosChecked, "photo")}`
              : "Names only, no photo was checked"}
            {check.checkedAt && <>, {check.checkedAt}</>}.
          </p>
        </>
      );
    case "waiting_for_photos":
      return (
        <>
          <p className="flex items-start gap-2 text-moss">
            <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
            Waiting for the photos to finish uploading. It starts on its own once they’re in.
          </p>
        </>
      );
    case "checking":
      return (
        <>
          {check.stuck ? (
            <Warning>
              No answer has come back yet. Reload the page in a minute to see why, or check again
              to try once more.
            </Warning>
          ) : (
            <p className="flex items-start gap-2 text-moss">
              <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
              Checking now. This usually takes under a minute.
            </p>
          )}
          {check.warning && <Warning>{check.warning}</Warning>}
        </>
      );
    case "failed":
      return (
        <Warning>
          The check didn’t work. {check.problem ?? "Something went wrong on the way."}
          {check.checkedAt && <> ({check.checkedAt})</>}
        </Warning>
      );
    case "unavailable":
      return <Warning>{check.problem}</Warning>;
    case "not_set_up":
      return (
        <p className="flex items-start gap-2 text-moss">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          The AI check isn’t set up on this database yet, so this record wasn’t checked.
        </p>
      );
    default:
      return (
        <p className="flex items-start gap-2 text-moss">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          Not checked yet.
        </p>
      );
  }
}

/** How often the page looks for the answer, and for how long, while a check is on its way */
const WATCH_MS = 5000;
const WATCH_TIMES = 36;

/**
 * Draws the page again every few seconds while a check on it is on its way, for three minutes at
 * most. The queue only shows it while a check is pending, so the timer stops when the answers are
 * in, and it gets a new key (so a new three minutes) when a different set of checks is pending.
 * When it can't reach the server, or stops looking, it says so.
 */
export function WatchForAnswers() {
  const times = useRef(0);
  const [problem, setProblem] = useState<string | null>(null);
  useVisibleTimer(async () => {
    if (times.current >= WATCH_TIMES) return;
    times.current += 1;
    let result;
    try {
      result = await refreshReviewQueue();
    } catch (e) {
      result = {
        ok: false as const,
        message: `The page couldn’t reach the server (${e instanceof Error ? e.message : String(e)}).`,
      };
    }
    if (!result.ok) {
      setProblem(`The page stopped getting AI answers. ${result.message} Reload the page to see them.`);
    } else if (times.current >= WATCH_TIMES) {
      setProblem("The page stopped looking for AI answers after 3 minutes. Reload the page to see them.");
    } else {
      setProblem(null);
    }
  }, WATCH_MS);
  if (!problem) return null;
  return (
    <p
      role="alert"
      className="mt-6 flex max-w-2xl items-start gap-2.5 rounded-xl border-2 border-warn bg-sheet p-4 font-bold text-warn"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      {problem}
    </p>
  );
}
