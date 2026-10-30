"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Icon } from "@/components/icon";
import { CONDITION_LABEL } from "@/lib/condition";
import {
  CONDITIONS,
  FIELD_ORDER,
  MAX,
  checkRecord,
  type Errors,
  type FieldId,
  type Values,
} from "@/lib/record-form";
import { editRecord, type RecordFormState } from "./actions";

const INITIAL: RecordFormState = { status: "idle" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="mt-1 flex items-start gap-2 text-sm font-bold text-bad">
      <Icon name="alert" className="mt-px size-4" />
      {message}
    </p>
  );
}

function describedBy(id: string, error?: string, hint = true) {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

const LABEL = "font-bold";
const HINT = "text-sm text-moss";
const OPTIONAL = <span className="font-normal text-moss"> (optional)</span>;

// version is the record's updated_at when the page loaded (src/lib/edit-version.ts)
type Props = { id: string; tag: string; initial: Values; version: string };

export function RecordForm({ id, tag, initial, version: loadedVersion }: Props) {
  const [state, formAction, pending] = useActionState(editRecord, INITIAL);
  // Without JavaScript the browser posts the form itself, and the page comes
  // back with the server's answer as the first state, so it starts from that
  const [values, setValues] = useState<Values>(() => {
    if (state.status === "saved" || state.status === "error") return state.values;
    return initial;
  });
  const [errors, setErrors] = useState<Errors>(() =>
    state.status === "error" ? state.fieldErrors : {},
  );
  const [formError, setFormError] = useState(() =>
    state.status === "error" ? state.message : null,
  );
  // An answer from the server carries the version to check against next. After
  // someone else saved first it stays the old one, so the form can't save over
  // their changes until the page is reloaded.
  const [version, setVersion] = useState(() =>
    state.status === "saved" || state.status === "error" ? state.version : loadedVersion,
  );
  const [saved, setSaved] = useState(() => state.status === "saved");
  const [handled, setHandled] = useState(state);
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(null);

  // A new answer from the server, picked up while rendering rather than in an
  // effect, so the page never draws the old answer first
  if (state !== handled) {
    setHandled(state);
    if (state.status === "error") {
      setErrors(state.fieldErrors);
      setFormError(state.message);
      setFocusRequest({ elementId: "error-summary" });
    } else if (state.status === "saved") {
      setValues(state.values);
      setVersion(state.version);
      setSaved(true);
      setFocusRequest({ elementId: "record-saved" });
    }
  }

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  const errorList = FIELD_ORDER.filter((field) => errors[field]);

  function update<K extends keyof Values>(key: K, value: Values[K], field?: FieldId) {
    setValues((current) => ({ ...current, [key]: value }));
    // The error goes away as soon as they change the field
    if (field && errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // With JavaScript the form is sent from here, once it passes the same
    // checks the server runs, and only once at a time
    event.preventDefault();
    if (pending) return;
    const found = checkRecord(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFocusRequest({ elementId: "error-summary" });
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  function jumpTo(event: MouseEvent<HTMLAnchorElement>, field: FieldId) {
    event.preventDefault();
    document.getElementById(field)?.focus();
  }

  function keepEditing(event: MouseEvent<HTMLAnchorElement>) {
    // Opening it in a new tab still works like a normal link
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setSaved(false);
    setFocusRequest({ elementId: "species-name" });
  }

  if (saved) {
    return (
      <section aria-labelledby="record-saved" className="card mt-8 max-w-2xl p-5 sm:p-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-ok-soft text-ok">
          <Icon name="check" />
        </span>
        <h2 id="record-saved" tabIndex={-1} className="mt-3 text-2xl font-bold tracking-tight">
          Changes saved
        </h2>
        <p className="mt-2">
          Record {tag} is up to date. Its status didn’t change, so if it’s
          published, visitors see the new details straight away.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard/records" className="btn btn-primary">
            Back to records
          </Link>
          <a href={`/dashboard/records/${id}/edit`} onClick={keepEditing} className="btn btn-secondary">
            Keep editing
          </a>
        </div>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
      className="mt-8 max-w-2xl space-y-7"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />

      {(errorList.length > 0 || formError) && (
        <section
          id="error-summary"
          tabIndex={-1}
          aria-labelledby="error-summary-title"
          className="rounded-xl border-2 border-bad bg-sheet p-4 sm:p-5"
        >
          <h2 id="error-summary-title" className="font-bold text-bad">
            {errorList.length > 0
              ? `Fix ${errorList.length === 1 ? "this" : `these ${errorList.length} things`} before you save your changes`
              : "Your changes weren’t saved"}
          </h2>
          {formError && <p className="mt-2">{formError}</p>}
          {errorList.length > 0 && (
            <ul className="mt-2 space-y-1">
              {errorList.map((field) => (
                <li key={field}>
                  <a
                    href={`#${field}`}
                    onClick={(event) => jumpTo(event, field)}
                    className="font-bold text-bad underline underline-offset-4"
                  >
                    {errors[field]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div>
        <label htmlFor="species-name" className={LABEL}>
          Species
        </label>
        <p id="species-name-hint" className={HINT}>
          The scientific name, like Shorea macrophylla. If it matches a species
          in the database the record links to it. If not, the record has no
          species yet and the public site only shows its grid square.
        </p>
        <FieldError id="species-name" message={errors["species-name"]} />
        <input
          id="species-name"
          name="speciesName"
          type="text"
          value={values.speciesName}
          onChange={(e) => update("speciesName", e.target.value, "species-name")}
          maxLength={MAX.speciesName}
          aria-required="true"
          aria-invalid={Boolean(errors["species-name"])}
          aria-describedby={describedBy("species-name", errors["species-name"])}
          autoComplete="off"
          spellCheck={false}
          className="field mt-2 font-latin text-lg italic"
        />
      </div>

      <div>
        <label htmlFor="common-name" className={LABEL}>
          Common name{OPTIONAL}
        </label>
        <FieldError id="common-name" message={errors["common-name"]} />
        <input
          id="common-name"
          name="commonName"
          type="text"
          value={values.commonName}
          onChange={(e) => update("commonName", e.target.value, "common-name")}
          maxLength={MAX.commonName}
          aria-invalid={Boolean(errors["common-name"])}
          aria-describedby={describedBy("common-name", errors["common-name"], false)}
          autoComplete="off"
          className="field mt-2"
        />
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <div>
          <label htmlFor="height" className={LABEL}>
            Height in metres{OPTIONAL}
          </label>
          <FieldError id="height" message={errors.height} />
          <input
            id="height"
            name="height"
            type="text"
            inputMode="decimal"
            value={values.height}
            onChange={(e) => update("height", e.target.value, "height")}
            aria-invalid={Boolean(errors.height)}
            aria-describedby={describedBy("height", errors.height, false)}
            autoComplete="off"
            className="field mt-2"
          />
        </div>

        <div>
          <label htmlFor="condition" className={LABEL}>
            Condition
          </label>
          <FieldError id="condition" message={errors.condition} />
          <select
            id="condition"
            name="condition"
            value={values.condition}
            onChange={(e) => update("condition", e.target.value as Values["condition"], "condition")}
            aria-required="true"
            aria-invalid={Boolean(errors.condition)}
            aria-describedby={describedBy("condition", errors.condition, false)}
            className="field mt-2"
          >
            <option value="">Choose a condition</option>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {CONDITION_LABEL[condition]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="recorded-at" className={LABEL}>
          Recorded on
        </label>
        <p id="recorded-at-hint" className={HINT}>
          Park time.
        </p>
        <FieldError id="recorded-at" message={errors["recorded-at"]} />
        <input
          id="recorded-at"
          name="recordedAt"
          type="datetime-local"
          value={values.recordedAt}
          onChange={(e) => update("recordedAt", e.target.value, "recorded-at")}
          aria-required="true"
          aria-invalid={Boolean(errors["recorded-at"])}
          aria-describedby={describedBy("recorded-at", errors["recorded-at"])}
          className="field mt-2 sm:max-w-sm"
        />
      </div>

      <fieldset aria-describedby="location-hint">
        <legend className={LABEL}>Location{OPTIONAL}</legend>
        <p id="location-hint" className={HINT}>
          Only change it to fix a wrong reading. Clear all three boxes to
          remove the location. Staff always see the exact spot. The public
          site follows the species rules.
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          {(
            [
              ["lat", "Latitude", "lat"],
              ["lng", "Longitude", "lng"],
              ["accuracy", "Accuracy (m)", "accuracy"],
            ] as const
          ).map(([field, label, key]) => (
            <div key={field}>
              <label htmlFor={field} className="text-sm font-bold">
                {label}
              </label>
              <FieldError id={field} message={errors[field]} />
              <input
                id={field}
                name={key}
                type="text"
                inputMode="decimal"
                value={values[key]}
                onChange={(e) => update(key, e.target.value, field)}
                aria-invalid={Boolean(errors[field])}
                aria-describedby={describedBy(field, errors[field], false)}
                autoComplete="off"
                className="field mt-1"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="notes" className={LABEL}>
          Notes{OPTIONAL}
        </label>
        <FieldError id="notes" message={errors.notes} />
        <textarea
          id="notes"
          name="notes"
          rows={4}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value, "notes")}
          maxLength={MAX.notes + 200}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={describedBy("notes", errors.notes, false)}
          className="field mt-2"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/dashboard/records" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
      <p role="status" className="sr-only">
        {pending ? "Saving your changes." : ""}
      </p>
    </form>
  );
}
