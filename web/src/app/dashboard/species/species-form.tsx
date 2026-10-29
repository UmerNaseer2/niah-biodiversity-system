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
import {
  HiddenLocationBadge,
  IucnChip,
  LatinName,
  ProtectedBadge,
} from "@/components/plant-bits";
import { IUCN, IUCN_CODES, type IucnCode } from "@/lib/iucn";
import {
  EMPTY,
  FIELD_ORDER,
  MAX,
  checkDetails,
  checkNewSpecies,
  lockReason,
  splitNames,
  tidy,
  type Errors,
  type FieldId,
  type Values,
} from "@/lib/species-form";
import { addSpecies, editSpecies, type SpeciesFormState } from "./actions";

const INITIAL: SpeciesFormState = { status: "idle" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={`${id}-error`}
      className="mt-1 flex items-start gap-2 text-sm font-bold text-bad"
    >
      <Icon name="alert" className="mt-px size-4" />
      {message}
    </p>
  );
}

function describedBy(id: string, error?: string, hint = true) {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

const LABEL = "font-bold";
const HINT = "text-sm text-moss";
const OPTIONAL = <span className="font-normal text-moss"> (optional)</span>;

// The add page passes the names already in the database, and the edit page
// passes the species as it is now, with its main photo for the preview
type Props =
  | { mode: "add"; existingNames: string[] }
  | { mode: "edit"; slug: string; initial: Values; photo: string | null };

export function SpeciesForm(props: Props) {
  const adding = props.mode === "add";
  const [state, formAction, pending] = useActionState(
    adding ? addSpecies : editSpecies,
    INITIAL,
  );
  // Without JavaScript the browser posts the form itself, and the page comes
  // back with the server's answer as the first state, so it starts from that.
  // The edit form doesn't send the scientific name, so that comes from the
  // species.
  const [values, setValues] = useState<Values>(() => {
    if (state.status === "saved") return state.values;
    if (props.mode === "add") {
      return state.status === "error" ? state.values : EMPTY;
    }
    return state.status === "error"
      ? { ...state.values, scientificName: props.initial.scientificName }
      : props.initial;
  });
  const [errors, setErrors] = useState<Errors>(() =>
    state.status === "error" ? state.fieldErrors : {},
  );
  const [formError, setFormError] = useState(() =>
    state.status === "error" ? state.message : null,
  );
  const [saved, setSaved] = useState(() =>
    state.status === "saved" ? state : null,
  );
  const [handled, setHandled] = useState(state);
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(
    null,
  );

  // A new answer from the server. It's picked up while rendering rather than
  // in an effect, so the page never draws the old answer first.
  if (state !== handled) {
    setHandled(state);
    if (state.status === "error") {
      setErrors(state.fieldErrors);
      setFormError(state.message);
      setFocusRequest({ elementId: "error-summary" });
    } else if (state.status === "saved") {
      // Editing it more starts from what was saved
      setValues(state.values);
      setSaved(state);
      setFocusRequest({ elementId: "species-saved" });
    }
  }

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  const locked = lockReason(values.iucn, values.sarawakProtected);
  const visibility = locked ? "rough" : values.visibility;
  const errorList = FIELD_ORDER.filter((id) => errors[id]);

  function update<K extends keyof Values>(key: K, value: Values[K], field?: FieldId) {
    setValues((current) => ({ ...current, [key]: value }));
    // The error goes away as soon as they change the field, like the mobile app
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
    const found =
      props.mode === "add"
        ? checkNewSpecies(values, props.existingNames)
        : checkDetails(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFocusRequest({ elementId: "error-summary" });
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: FieldId) {
    event.preventDefault();
    document.getElementById(id)?.focus();
  }

  function showForm(event: MouseEvent<HTMLAnchorElement>) {
    // Opening it in a new tab still works like a normal link
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (adding) setValues(EMPTY);
    setErrors({});
    setFormError(null);
    setSaved(null);
    setFocusRequest({ elementId: adding ? "scientific-name" : "authority" });
  }

  if (saved) {
    const commonName = splitNames(saved.values.commonNames)[0];
    return (
      <section
        aria-labelledby="species-saved"
        className="card mt-8 max-w-2xl p-5 sm:p-6"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-ok-soft text-ok">
          <Icon name="check" />
        </span>
        <h2
          id="species-saved"
          tabIndex={-1}
          className="mt-3 text-2xl font-bold tracking-tight"
        >
          {adding ? "Species added" : "Changes saved"}
        </h2>
        <p className="mt-2">
          {commonName} (<LatinName name={saved.values.scientificName} />){" "}
          {adding
            ? "is in the database and has its own page on the public site."
            : "is up to date on the public site."}{" "}
          {saved.values.visibility === "rough"
            ? "The public map only shows a rough area for its plants."
            : "The public map shows the exact spot of its plants."}
        </p>
        <p className="mt-2 text-moss">
          {adding
            ? "The mobile app picks it up once the phone downloads the species list when it syncs."
            : "The mobile app gets the changes once the phone downloads the species list when it syncs."}{" "}
          That comes with item 10 in Sprint 2.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/plants/${saved.slug}`} className="btn btn-primary">
            See its public page
          </Link>
          {adding && (
            <Link
              href={`/dashboard/species/${saved.slug}/edit#photos`}
              className="btn btn-secondary"
            >
              Add photos
            </Link>
          )}
          <Link href="/dashboard/species" className="btn btn-secondary">
            Back to species
          </Link>
          <a
            href={
              adding
                ? "/dashboard/species/new"
                : `/dashboard/species/${saved.slug}/edit`
            }
            onClick={showForm}
            className="btn btn-secondary"
          >
            {adding ? "Add another" : "Keep editing"}
          </a>
        </div>
      </section>
    );
  }

  const previewName = splitNames(values.commonNames)[0];

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl space-y-7"
      >
        {props.mode === "edit" && (
          <input type="hidden" name="slug" value={props.slug} />
        )}

        {(errorList.length > 0 || formError) && (
          <section
            id="error-summary"
            tabIndex={-1}
            aria-labelledby="error-summary-title"
            className="rounded-xl border-2 border-bad bg-sheet p-4 sm:p-5"
          >
            <h2 id="error-summary-title" className="font-bold text-bad">
              {errorList.length > 0 ? (
                <>
                  Fix{" "}
                  {errorList.length === 1
                    ? "this"
                    : `these ${errorList.length} things`}{" "}
                  {adding ? "before you add the species" : "before you save your changes"}
                </>
              ) : adding ? (
                "The species wasn’t added"
              ) : (
                "Your changes weren’t saved"
              )}
            </h2>
            {formError && <p className="mt-2">{formError}</p>}
            {errorList.length > 0 && (
              <ul className="mt-2 space-y-1">
                {errorList.map((id) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={(event) => jumpTo(event, id)}
                      className="font-bold text-bad underline underline-offset-4"
                    >
                      {errors[id]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {props.mode === "add" ? (
          <div>
            <label htmlFor="scientific-name" className={LABEL}>
              Scientific name
            </label>
            <p id="scientific-name-hint" className={HINT}>
              Genus and species, like Shorea macrophylla.
            </p>
            <FieldError id="scientific-name" message={errors["scientific-name"]} />
            <input
              id="scientific-name"
              name="scientificName"
              type="text"
              value={values.scientificName}
              onChange={(e) => update("scientificName", e.target.value, "scientific-name")}
              maxLength={MAX.scientificName}
              aria-required="true"
              aria-invalid={Boolean(errors["scientific-name"])}
              aria-describedby={describedBy("scientific-name", errors["scientific-name"])}
              autoComplete="off"
              spellCheck={false}
              className="field mt-2 font-latin text-lg italic"
            />
          </div>
        ) : (
          <div>
            <p className={LABEL}>Scientific name</p>
            <p className="mt-1 text-lg">
              <LatinName name={values.scientificName} />
            </p>
            <p className={HINT}>
              It can’t change, because the link to its public page and its
              records use it.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="authority" className={LABEL}>
            Authority{OPTIONAL}
          </label>
          <p id="authority-hint" className={HINT}>
            Who named it, like (de Vriese) P.S.Ashton.
          </p>
          <FieldError id="authority" message={errors.authority} />
          <input
            id="authority"
            name="authority"
            type="text"
            value={values.authority}
            onChange={(e) => update("authority", e.target.value, "authority")}
            maxLength={MAX.authority}
            aria-invalid={Boolean(errors.authority)}
            aria-describedby={describedBy("authority", errors.authority)}
            autoComplete="off"
            spellCheck={false}
            className="field mt-2"
          />
        </div>

        <div>
          <label htmlFor="family" className={LABEL}>
            Family
          </label>
          <p id="family-hint" className={HINT}>
            Like Dipterocarpaceae.
          </p>
          <FieldError id="family" message={errors.family} />
          <input
            id="family"
            name="family"
            type="text"
            value={values.family}
            onChange={(e) => update("family", e.target.value, "family")}
            maxLength={MAX.family}
            aria-required="true"
            aria-invalid={Boolean(errors.family)}
            aria-describedby={describedBy("family", errors.family)}
            autoComplete="off"
            spellCheck={false}
            className="field mt-2 sm:max-w-sm"
          />
        </div>

        <div>
          <label htmlFor="common-names" className={LABEL}>
            Common names
          </label>
          <p id="common-names-hint" className={HINT}>
            Separate them with commas. The first one goes on cards and tags.
          </p>
          <FieldError id="common-names" message={errors["common-names"]} />
          <input
            id="common-names"
            name="commonNames"
            type="text"
            value={values.commonNames}
            onChange={(e) => update("commonNames", e.target.value, "common-names")}
            maxLength={MAX.commonNames}
            aria-required="true"
            aria-invalid={Boolean(errors["common-names"])}
            aria-describedby={describedBy("common-names", errors["common-names"])}
            autoComplete="off"
            className="field mt-2"
          />
        </div>

        <div>
          <label htmlFor="iucn" className={LABEL}>
            IUCN Red List status
          </label>
          <p id="iucn-hint" className={HINT}>
            Vulnerable, Endangered and Critically Endangered count as
            threatened. Only Least Concern and Near Threatened species can show
            their exact spot on the public map.
          </p>
          <FieldError id="iucn" message={errors.iucn} />
          <select
            id="iucn"
            name="iucn"
            value={values.iucn}
            onChange={(e) => update("iucn", e.target.value as IucnCode | "", "iucn")}
            aria-required="true"
            aria-invalid={Boolean(errors.iucn)}
            aria-describedby={describedBy("iucn", errors.iucn)}
            className="field mt-2 sm:max-w-sm"
          >
            <option value="">Choose a status</option>
            {IUCN_CODES.map((code) => (
              <option key={code} value={code}>
                {IUCN[code].label} ({code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="sarawak-protected"
            name="sarawakProtected"
            type="checkbox"
            checked={values.sarawakProtected}
            onChange={(e) => update("sarawakProtected", e.target.checked)}
            aria-describedby="sarawak-protected-hint"
            className="mt-0.5 size-5 shrink-0 accent-forest"
          />
          <div>
            <label htmlFor="sarawak-protected" className={LABEL}>
              Protected in Sarawak
            </label>
            <p id="sarawak-protected-hint" className={HINT}>
              Listed as a protected plant under the Wild Life Protection
              Ordinance 1998.
            </p>
          </div>
        </div>

        <fieldset aria-describedby={locked ? "visibility-hint visibility-lock" : "visibility-hint"}>
          <legend className={LABEL}>On the public map</legend>
          <p id="visibility-hint" className={HINT}>
            Staff always see the exact spot. This only changes what visitors
            see.
          </p>
          <div className="mt-3 space-y-3">
            <div className="flex items-start gap-3">
              <input
                id="visibility-exact"
                type="radio"
                name="visibility"
                value="exact"
                checked={visibility === "exact"}
                disabled={Boolean(locked)}
                onChange={() => update("visibility", "exact")}
                aria-describedby="visibility-exact-hint"
                className="peer mt-0.5 size-5 shrink-0 accent-forest"
              />
              <div className="peer-disabled:opacity-50">
                <label htmlFor="visibility-exact" className="font-bold">
                  Exact spot
                </label>
                <p id="visibility-exact-hint" className={HINT}>
                  Visitors can walk up to the plant. Fine for common species.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <input
                id="visibility-rough"
                type="radio"
                name="visibility"
                value="rough"
                checked={visibility === "rough"}
                onChange={() => update("visibility", "rough")}
                aria-describedby="visibility-rough-hint"
                className="mt-0.5 size-5 shrink-0 accent-forest"
              />
              <div>
                <label htmlFor="visibility-rough" className="font-bold">
                  Rough area only
                </label>
                <p id="visibility-rough-hint" className={HINT}>
                  Visitors see the 440 m grid square the plant is in, not the
                  plant.
                </p>
              </div>
            </div>
          </div>
          {locked && (
            <p
              id="visibility-lock"
              className="mt-3 flex items-start gap-2 rounded-lg bg-paper px-3 py-2 text-sm"
            >
              <Icon name="lock" className="mt-0.5 size-4 text-moss" />
              <span>
                {locked} The site should never help someone find a plant
                they could dig up or cut down.
              </span>
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="summary" className={LABEL}>
            Summary
          </label>
          <p id="summary-hint" className={HINT}>
            One sentence for the plant list and the tag page.
          </p>
          <FieldError id="summary" message={errors.summary} />
          <textarea
            id="summary"
            name="summary"
            rows={2}
            value={values.summary}
            onChange={(e) => update("summary", e.target.value, "summary")}
            maxLength={MAX.summary}
            aria-required="true"
            aria-invalid={Boolean(errors.summary)}
            aria-describedby={describedBy("summary", errors.summary)}
            className="field mt-2"
          />
        </div>

        <div>
          <label htmlFor="about" className={LABEL}>
            About{OPTIONAL}
          </label>
          <p id="about-hint" className={HINT}>
            A few sentences for the species page: what it looks like and
            anything interesting about it.
          </p>
          <FieldError id="about" message={errors.about} />
          <textarea
            id="about"
            name="about"
            rows={5}
            value={values.about}
            onChange={(e) => update("about", e.target.value, "about")}
            maxLength={MAX.about}
            aria-invalid={Boolean(errors.about)}
            aria-describedby={describedBy("about", errors.about)}
            className="field mt-2"
          />
        </div>

        <div className="rounded-xl border border-line bg-sheet p-4">
          <p className={LABEL}>Photos</p>
          <p className={HINT}>
            {adding
              ? "You can add photos once the species is saved, from its edit page."
              : "Photos have their own section under this form. They save as soon as you upload them, so this button leaves them as they are."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-6">
          <button type="submit" aria-disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : adding ? "Add species" : "Save changes"}
          </button>
          <Link href="/dashboard/species" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
        <p role="status" className="sr-only">
          {pending ? (adding ? "Saving the species." : "Saving your changes.") : ""}
        </p>
      </form>

      <aside aria-labelledby="preview-heading" className="lg:pt-1">
        <div className="lg:sticky lg:top-6">
          <h2 id="preview-heading" className="eyebrow">
            Preview on the public site
          </h2>
          <div className="card mt-3 overflow-hidden">
            {props.mode === "edit" && props.photo ? (
              // A plain <img>, like the gallery on the public pages
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.photo}
                alt=""
                className="h-28 w-full border-b border-line object-cover"
              />
            ) : (
              <div aria-hidden="true" className="hatch h-28 border-b border-line" />
            )}
            <div className="p-4">
              <p className="text-lg font-bold leading-snug">
                {previewName || <span className="text-pencil">Common name</span>}
              </p>
              <p className="text-sm">
                {tidy(values.scientificName) ? (
                  <LatinName name={tidy(values.scientificName)} />
                ) : (
                  <span className="font-latin italic text-pencil">
                    Genus species
                  </span>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {values.iucn && <IucnChip code={values.iucn} />}
                {values.sarawakProtected && <ProtectedBadge />}
                {visibility === "rough" && <HiddenLocationBadge />}
              </div>
              <p className="mt-3 text-sm text-moss">
                {tidy(values.summary) || "The summary shows here."}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
