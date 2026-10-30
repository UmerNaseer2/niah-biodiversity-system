import { Icon } from "@/components/icon";
import { formatDate, formatTime, parkTime } from "@/lib/format";
import { HISTORY_LIMIT, type ChangeLine, type History } from "@/lib/history";

function Change({ line }: { line: ChangeLine }) {
  if (line.kind === "short") return <li>{line.text}</li>;
  return (
    <li>
      {/* A details element opens without JavaScript too */}
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 underline decoration-line underline-offset-4 hover:decoration-ink [&::-webkit-details-marker]:hidden">
          <Icon
            name="chevron-right"
            className="size-4 shrink-0 transition-transform group-open:rotate-90"
          />
          {line.text}
        </summary>
        <dl className="mt-2 space-y-2 border-l-2 border-line pl-4">
          {line.from && (
            <div>
              <dt className="text-sm font-bold text-moss">Before</dt>
              <dd className="whitespace-pre-line">{line.from}</dd>
            </div>
          )}
          {line.to && (
            <div>
              <dt className="text-sm font-bold text-moss">After</dt>
              <dd className="whitespace-pre-line">{line.to}</dd>
            </div>
          )}
        </dl>
      </details>
    </li>
  );
}

/**
 * The History section at the bottom of the record and species edit pages.
 * It shows who saved each change and when, newest first.
 */
export function EditHistory({
  history,
  what,
}: {
  history: History | null;
  what: "record" | "species";
}) {
  return (
    <section
      aria-labelledby="history-heading"
      className="mt-14 max-w-2xl border-t border-line pt-10"
    >
      <h2 id="history-heading" className="text-2xl font-bold tracking-tight">
        History
      </h2>
      <p className="mt-1 text-moss">
        Changes saved to this {what}, newest first. The history started when
        an administrator set it up, so older changes aren’t here. It doesn’t
        keep the map location, only that it changed, but text like notes is
        kept word for word.
      </p>

      {history === null ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          The history didn’t load. Refresh the page, and if it keeps
          happening, ask an administrator to check 013_edit_history.sql has
          been run (supabase/README.md).
        </p>
      ) : history.entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line p-4 text-moss">
          Nobody has changed this {what} since the history started.
        </p>
      ) : (
        <>
          <ol className="mt-5 space-y-3">
            {history.entries.map((entry) => {
              const time = parkTime(entry.changedAt);
              return (
                <li
                  key={entry.id}
                  className="rounded-xl border border-line bg-sheet p-4"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-bold">
                      {entry.who ?? "Someone in the Supabase dashboard"}
                      {entry.accountDeleted && (
                        <span className="font-normal text-moss">
                          {" "}
                          (account deleted)
                        </span>
                      )}
                    </span>
                    <time dateTime={entry.changedAt} className="text-moss">
                      {formatDate(time)}, {formatTime(time)}
                    </time>
                  </p>
                  {entry.changes.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {entry.changes.map((line, index) => (
                        <Change key={index} line={line} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-moss">
                      Saved a change the website can’t show.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          {history.more && (
            <p className="mt-4 text-sm text-moss">
              Showing the newest {HISTORY_LIMIT} changes. Older ones are still
              kept in the database.
            </p>
          )}
        </>
      )}
    </section>
  );
}
