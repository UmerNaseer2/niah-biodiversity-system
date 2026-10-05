"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { Icon } from "@/components/icon";
import {
  HiddenLocationBadge,
  IucnChip,
  LatinName,
  ProtectedBadge,
} from "@/components/plant-bits";
import { Planned } from "@/components/tape";
import { IUCN, IUCN_ORDER, type IucnCode } from "@/lib/iucn";

type Values = {
  scientificName: string;
  authority: string;
  family: string;
  commonNames: string;
  iucn: IucnCode | "";
  sarawakProtected: boolean;
  visibility: "exact" | "rough";
  summary: string;
  about: string;
};

// Only the fields that can have an error, in the order they appear
type FieldId = "scientific-name" | "family" | "common-names" | "iucn" | "summary";
type Errors = Partial<Record<FieldId, string>>;

const EMPTY: Values = {
  scientificName: "",
  authority: "",
  family: "",
  commonNames: "",
  iucn: "",
  sarawakProtected: false,
  visibility: "exact",
  summary: "",
  about: "",
};

const FIELD_ORDER: FieldId[] = [
  "scientific-name",
  "family",
  "common-names",
  "iucn",
  "summary",
];

/** "shorea   macrophylla " becomes "shorea macrophylla" */
function tidy(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function splitNames(value: string) {
  return value
    .split(",")
    .map(tidy)
    .filter(Boolean);
}

function validate(values: Values, existingNames: string[]): Errors {
  const errors: Errors = {};
  const name = tidy(values.scientificName);

  if (!name) {
    errors["scientific-name"] = "Enter the scientific name.";
  } else if (!/^[A-Z][a-z]+ [a-z]+(-[a-z]+)?$/.test(name)) {
    errors["scientific-name"] =
      "Write the genus then the species, like Shorea macrophylla.";
  } else if (
    existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())
  ) {
    errors["scientific-name"] = `${name} is already in the database.`;
  }

  if (!tidy(values.family)) errors.family = "Enter the family.";
  if (splitNames(values.commonNames).length === 0) {
    errors["common-names"] = "Enter at least one common name.";
  }
  if (!values.iucn) errors.iucn = "Choose the IUCN status.";
  if (!tidy(values.summary)) errors.summary = "Write a one sentence summary.";

  return errors;
}

/** Why the exact spot can't be shown, or null when it's up to the officer */
function lockReason(values: Values) {
  const threatened = values.iucn !== "" && IUCN[values.iucn].threatened;
  if (threatened && values.sarawakProtected) {
    return `${IUCN[values.iucn as IucnCode].label} and protected species always get a rough area only.`;
  }
  if (threatened) {
    return `${IUCN[values.iucn as IucnCode].label} species always get a rough area only.`;
  }
  if (values.sarawakProtected) {
    return "Protected species always get a rough area only.";
  }
  return null;
}

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

export function NewSpeciesForm({ existingNames }: { existingNames: string[] }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [added, setAdded] = useState<Values | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(
    null,
  );

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  const locked = lockReason(values);
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
    event.preventDefault();
    const found = validate(values, existingNames);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFocusRequest({ elementId: "error-summary" });
      return;
    }
    setAdded({ ...values, visibility });
    setFocusRequest({ elementId: "species-added" });
  }

  function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: FieldId) {
    event.preventDefault();
    document.getElementById(id)?.focus();
  }

  function addAnother() {
    setValues(EMPTY);
    setErrors({});
    setAdded(null);
    setFocusRequest({ elementId: "scientific-name" });
  }

  if (added) {
    const names = splitNames(added.commonNames);
    return (
      <section
        aria-labelledby="species-added"
        className="card mt-8 max-w-2xl p-5 sm:p-6"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-ok-soft text-ok">
          <Icon name="check" />
        </span>
        <h2
          id="species-added"
          tabIndex={-1}
          className="mt-3 text-2xl font-bold tracking-tight"
        >
          Species added to this demo
        </h2>
        <p className="mt-2">
          {names[0]} (<LatinName name={tidy(added.scientificName)} />) would
          now show up in the mobile app and on the public site, with{" "}
          {added.visibility === "rough"
            ? "only a rough area on the map."
            : "exact spots on the map."}
        </p>
        <p className="mt-2 text-moss">
          Nothing was saved though. The database is item 14, so it’s gone when
          you refresh.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard/species" className="btn btn-primary">
            Back to species
          </Link>
          <button type="button" onClick={addAnother} className="btn btn-secondary">
            Add another
          </button>
        </div>
      </section>
    );
  }

  const previewName = splitNames(values.commonNames)[0];

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-7">
        {errorList.length > 0 && (
          <section
            id="error-summary"
            tabIndex={-1}
            aria-labelledby="error-summary-title"
            className="rounded-xl border-2 border-bad bg-sheet p-4 sm:p-5"
          >
            <h2 id="error-summary-title" className="font-bold text-bad">
              Fix {errorList.length === 1 ? "this" : `these ${errorList.length} things`}{" "}
              before you add the species
            </h2>
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
          </section>
        )}

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
            type="text"
            value={values.scientificName}
            onChange={(e) => update("scientificName", e.target.value, "scientific-name")}
            aria-required="true"
            aria-invalid={Boolean(errors["scientific-name"])}
            aria-describedby={describedBy("scientific-name", errors["scientific-name"])}
            autoComplete="off"
            spellCheck={false}
            className="field mt-2 font-latin text-lg italic"
          />
        </div>

        <div>
          <label htmlFor="authority" className={LABEL}>
            Authority{OPTIONAL}
          </label>
          <p id="authority-hint" className={HINT}>
            Who named it, like (de Vriese) P.S.Ashton.
          </p>
          <input
            id="authority"
            type="text"
            value={values.authority}
            onChange={(e) => update("authority", e.target.value)}
            aria-describedby="authority-hint"
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
            type="text"
            value={values.family}
            onChange={(e) => update("family", e.target.value, "family")}
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
            type="text"
            value={values.commonNames}
            onChange={(e) => update("commonNames", e.target.value, "common-names")}
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
            threatened.
          </p>
          <FieldError id="iucn" message={errors.iucn} />
          <select
            id="iucn"
            value={values.iucn}
            onChange={(e) => update("iucn", e.target.value as IucnCode | "", "iucn")}
            aria-required="true"
            aria-invalid={Boolean(errors.iucn)}
            aria-describedby={describedBy("iucn", errors.iucn)}
            className="field mt-2 sm:max-w-sm"
          >
            <option value="">Choose a status</option>
            {IUCN_ORDER.map((code) => (
              <option key={code} value={code}>
                {IUCN[code].label} ({code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="sarawak-protected"
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
            rows={2}
            value={values.summary}
            onChange={(e) => update("summary", e.target.value, "summary")}
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
          <textarea
            id="about"
            rows={5}
            value={values.about}
            onChange={(e) => update("about", e.target.value)}
            aria-describedby="about-hint"
            className="field mt-2"
          />
        </div>

        <Planned items={[18]} title="Photos">
          <p>
            Adding photos comes with the photo gallery, so a new species
            starts with hatched boxes.
          </p>
        </Planned>

        <div className="flex flex-wrap gap-2 border-t border-line pt-6">
          <button type="submit" className="btn btn-primary">
            Add species
          </button>
          <Link href="/dashboard/species" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>

      <aside aria-labelledby="preview-heading" className="lg:pt-1">
        <div className="lg:sticky lg:top-6">
          <h2 id="preview-heading" className="eyebrow">
            Preview on the public site
          </h2>
          <div className="card mt-3 overflow-hidden">
            <div aria-hidden="true" className="hatch h-28 border-b border-line" />
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
