"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Icon } from "@/components/icon";
import { tidy } from "@/lib/species-form";
import {
  MAX_CAPTION,
  MAX_CREDIT,
  MAX_PHOTOS,
  UPLOAD_TYPES,
  checkPhoto,
  checkPhotoDetails,
  mainPhoto,
  type PhotoErrors,
  type PhotoFieldId,
  type SpeciesPhoto,
} from "@/lib/species-photos";
import { managePhoto, uploadSpeciesPhoto, type PhotoState } from "../../actions";

const INITIAL: PhotoState = { status: "idle" };
const FIELD_ORDER: PhotoFieldId[] = ["photo-file", "photo-caption", "photo-credit"];
const LABEL = "font-bold";
const HINT = "text-sm text-moss";

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

function describedBy(id: string, error?: string) {
  return [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ");
}

// Species photos on the edit page (item 18). Unlike the form above, each
// change here saves straight away, and the page reloads its photos after.
export function PhotoManager({
  slug,
  name,
  photos,
}: {
  slug: string;
  name: string;
  photos: SpeciesPhoto[];
}) {
  const [upload, uploadAction, uploading] = useActionState(uploadSpeciesPhoto, INITIAL);
  const [manage, manageAction, managing] = useActionState(managePhoto, INITIAL);
  const [errors, setErrors] = useState<PhotoErrors>(() =>
    upload.status === "error" ? upload.fieldErrors : {},
  );
  const [uploadError, setUploadError] = useState(() =>
    upload.status === "error" ? upload.message : null,
  );
  const [manageError, setManageError] = useState(() =>
    manage.status === "error" ? manage.message : null,
  );
  // What the last change did, like "Photo added."
  const [notice, setNotice] = useState(() =>
    manage.status === "done" ? manage.message : upload.status === "done" ? upload.message : "",
  );
  const [handledUpload, setHandledUpload] = useState(upload);
  const [handledManage, setHandledManage] = useState(manage);
  // Which photo's Remove is asking first. It goes by place, since two outside
  // links can be the same
  const [confirming, setConfirming] = useState<number | null>(null);
  // Which photo's caption form has a problem, and what it is
  const [detailErrors, setDetailErrors] = useState<{
    index: number;
    errors: PhotoErrors;
  } | null>(null);
  // Goes up each time a change saves, so the caption forms close and start
  // from what was saved
  const [saved, setSaved] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ elementId: string } | null>(
    null,
  );
  const [resetRequest, setResetRequest] = useState<object | null>(null);
  const uploadForm = useRef<HTMLFormElement>(null);

  // New answers from the server, picked up while rendering like the species
  // form does
  if (upload !== handledUpload) {
    setHandledUpload(upload);
    if (upload.status === "error") {
      setErrors(upload.fieldErrors);
      setUploadError(upload.message);
      setFocusRequest({ elementId: "photo-error-summary" });
    } else if (upload.status === "done") {
      setErrors({});
      setUploadError(null);
      setNotice(upload.message);
      setResetRequest({});
    }
  }
  if (manage !== handledManage) {
    setHandledManage(manage);
    setConfirming(null);
    if (manage.status === "error") {
      setManageError(manage.message);
      setFocusRequest({ elementId: "photo-manage-error" });
    } else if (manage.status === "done") {
      setNotice(manage.message);
      setDetailErrors(null);
      setSaved((count) => count + 1);
      // The button that was pressed may be gone now, so focus goes back to the top
      setFocusRequest({ elementId: "photos-heading" });
    }
  }

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.elementId)?.focus();
  }, [focusRequest]);

  useEffect(() => {
    // The photo saved, so the form starts empty for the next one
    if (resetRequest) uploadForm.current?.reset();
  }, [resetRequest]);

  const main = mainPhoto(photos);
  const full = photos.length >= MAX_PHOTOS;
  const busy = uploading || managing;
  const errorList = FIELD_ORDER.filter((id) => errors[id]);

  function clearError(id: PhotoFieldId) {
    if (!errors[id]) return;
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function handleUpload(event: FormEvent<HTMLFormElement>) {
    // With JavaScript the photo is checked here first, so a file that's too
    // big never gets sent
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const sent = formData.get("photo");
    const found = checkPhoto(
      sent instanceof File ? sent : null,
      tidy(String(formData.get("caption") ?? "")),
      tidy(String(formData.get("credit") ?? "")),
    );
    setErrors(found);
    setUploadError(null);
    setManageError(null);
    setNotice("");
    if (Object.keys(found).length > 0) {
      setFocusRequest({ elementId: "photo-error-summary" });
      return;
    }
    startTransition(() => uploadAction(formData));
  }

  function handleManage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    setManageError(null);
    setNotice("");
    startTransition(() => manageAction(formData));
  }

  function handleDetails(event: FormEvent<HTMLFormElement>, index: number) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const found = checkPhotoDetails(
      tidy(String(formData.get("caption") ?? "")),
      tidy(String(formData.get("credit") ?? "")),
    );
    setManageError(null);
    setNotice("");
    if (Object.keys(found).length > 0) {
      setDetailErrors({ index, errors: found });
      setFocusRequest({
        elementId: `photo-${index}-${found["photo-caption"] ? "caption" : "credit"}`,
      });
      return;
    }
    setDetailErrors(null);
    startTransition(() => manageAction(formData));
  }

  function clearDetailError(index: number, id: PhotoFieldId) {
    if (detailErrors?.index !== index || !detailErrors.errors[id]) return;
    const errors = { ...detailErrors.errors };
    delete errors[id];
    setDetailErrors({ index, errors });
  }

  function closeDetails(details: HTMLDetailsElement, index: number) {
    // Closing it throws away what was typed, so it opens on the saved caption
    details.querySelector("form")?.reset();
    if (detailErrors?.index === index) setDetailErrors(null);
  }

  function askFirst(event: MouseEvent<HTMLButtonElement>, index: number) {
    // With JavaScript, Remove asks first. Without it the button just removes.
    event.preventDefault();
    setConfirming(index);
    setFocusRequest({ elementId: `photo-${index}-confirm` });
  }

  function keep(index: number) {
    setConfirming(null);
    setFocusRequest({ elementId: `photo-${index}-remove` });
  }

  function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: PhotoFieldId) {
    event.preventDefault();
    document.getElementById(id)?.focus();
  }

  return (
    <section
      id="photos"
      aria-labelledby="photos-heading"
      className="mt-14 max-w-2xl scroll-mt-6 border-t border-line pt-10"
    >
      <h2 id="photos-heading" tabIndex={-1} className="text-2xl font-bold tracking-tight">
        Photos
      </h2>
      <p className="mt-1 text-moss">
        They show on the public page for {name}. The main photo also shows in
        the plant list and on tag pages. A species can have up to {MAX_PHOTOS}.
        Changes here save straight away.
      </p>

      <p role="status" className="sr-only">
        {uploading ? "Uploading the photo." : managing ? "Saving." : notice}
      </p>
      {notice && (
        <p
          aria-hidden="true"
          className="mt-5 flex items-center gap-2 rounded-xl bg-ok-soft p-3 font-bold text-ok"
        >
          <Icon name="check" className="size-4" />
          {notice}
        </p>
      )}
      {manageError && (
        <p
          id="photo-manage-error"
          tabIndex={-1}
          className="mt-5 flex items-start gap-2.5 rounded-xl border-2 border-bad bg-sheet p-4 font-bold text-bad"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {manageError}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line p-4 text-moss">
          No photos yet. The public page says so until you add one.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {photos.map((photo, index) => {
            const isMain = photo === main;
            const fieldErrors = detailErrors?.index === index ? detailErrors.errors : {};
            const captionId = `photo-${index}-caption`;
            const creditId = `photo-${index}-credit`;
            return (
              // Two outside links can be the same, so the index goes in too
              <li key={`${index}-${photo.key}`} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- like the public gallery */}
                <img
                  src={photo.src}
                  alt={photo.caption || `A photo of ${name}`}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full border-b border-line object-cover"
                />
                <div className="p-4">
                  {isMain && (
                    <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">
                      <Icon name="check" className="size-3.5" />
                      Main photo
                    </p>
                  )}
                  <p className="text-sm">{photo.caption}</p>
                  <p className="mt-1 text-xs text-moss">
                    Photo: {photo.credit}
                    {!photo.path && ". Linked from another site."}
                  </p>

                  {/* A details element opens without JavaScript too */}
                  <details
                    key={saved}
                    onToggle={(event) => {
                      if (!event.currentTarget.open) closeDetails(event.currentTarget, index);
                    }}
                    className="group mt-3"
                  >
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold underline underline-offset-4 hover:text-moss [&::-webkit-details-marker]:hidden">
                      <Icon name="pencil" className="size-4" />
                      <span className="group-open:hidden">Edit caption and credit</span>
                      <span className="hidden group-open:inline">Close without saving</span>
                    </summary>
                    <form
                      action={manageAction}
                      onSubmit={(event) => handleDetails(event, index)}
                      noValidate
                      className="mt-3 space-y-4"
                    >
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="key" value={photo.key} />
                      <input type="hidden" name="index" value={index} />
                      <input type="hidden" name="intent" value="details" />
                      <div>
                        <label htmlFor={captionId} className="text-sm font-bold">
                          Caption
                        </label>
                        <p id={`${captionId}-hint`} className={HINT}>
                          What the photo shows. Don’t say where in the park the
                          plant is.
                        </p>
                        <FieldError id={captionId} message={fieldErrors["photo-caption"]} />
                        <textarea
                          id={captionId}
                          name="caption"
                          rows={3}
                          defaultValue={photo.caption}
                          maxLength={MAX_CAPTION}
                          onChange={() => clearDetailError(index, "photo-caption")}
                          aria-invalid={Boolean(fieldErrors["photo-caption"])}
                          aria-describedby={describedBy(captionId, fieldErrors["photo-caption"])}
                          className="field mt-1.5"
                        />
                      </div>
                      <div>
                        <label htmlFor={creditId} className="text-sm font-bold">
                          Taken by
                        </label>
                        <p id={`${creditId}-hint`} className={HINT}>
                          Shows under the photo after “Photo:”.
                        </p>
                        <FieldError id={creditId} message={fieldErrors["photo-credit"]} />
                        <input
                          id={creditId}
                          name="credit"
                          type="text"
                          defaultValue={photo.credit}
                          maxLength={MAX_CREDIT}
                          onChange={() => clearDetailError(index, "photo-credit")}
                          aria-invalid={Boolean(fieldErrors["photo-credit"])}
                          aria-describedby={describedBy(creditId, fieldErrors["photo-credit"])}
                          className="field mt-1.5"
                        />
                      </div>
                      <button type="submit" aria-disabled={busy} className="btn btn-primary">
                        {managing ? "Saving…" : "Save caption and credit"}
                      </button>
                    </form>
                  </details>

                  {confirming === index ? (
                    <form action={manageAction} onSubmit={handleManage} className="mt-3">
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="key" value={photo.key} />
                      <input type="hidden" name="index" value={index} />
                      <input type="hidden" name="intent" value="remove" />
                      <p id={`photo-${index}-confirm`} tabIndex={-1} className="text-sm font-bold">
                        Remove this photo?
                        {photo.path && " Its file is deleted too."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="submit" aria-disabled={busy} className="btn btn-danger">
                          {managing ? "Removing…" : "Remove"}
                        </button>
                        <button
                          type="button"
                          onClick={() => keep(index)}
                          className="btn btn-secondary"
                        >
                          Keep it
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isMain && (
                        <form action={manageAction} onSubmit={handleManage}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="key" value={photo.key} />
                          <input type="hidden" name="index" value={index} />
                          <input type="hidden" name="intent" value="main" />
                          <button
                            type="submit"
                            aria-disabled={busy}
                            className="btn btn-secondary"
                          >
                            Make main photo
                          </button>
                        </form>
                      )}
                      <form action={manageAction} onSubmit={handleManage}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="key" value={photo.key} />
                        <input type="hidden" name="index" value={index} />
                        <input type="hidden" name="intent" value="remove" />
                        <button
                          id={`photo-${index}-remove`}
                          type="submit"
                          onClick={(event) => askFirst(event, index)}
                          aria-disabled={busy}
                          className="btn btn-danger"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {full ? (
        <p className="mt-8 text-moss">
          {name} has {MAX_PHOTOS} photos, which is the most a species can have.
          Remove one to add another.
        </p>
      ) : (
        <form
          ref={uploadForm}
          action={uploadAction}
          onSubmit={handleUpload}
          noValidate
          className="mt-8 space-y-6 rounded-xl border border-line bg-sheet p-5 sm:p-6"
        >
          <h3 className="text-lg font-bold">Add a photo</h3>
          <input type="hidden" name="slug" value={slug} />

          {(errorList.length > 0 || uploadError) && (
            <section
              id="photo-error-summary"
              tabIndex={-1}
              aria-labelledby="photo-error-summary-title"
              className="rounded-xl border-2 border-bad bg-sheet p-4"
            >
              <h4 id="photo-error-summary-title" className="font-bold text-bad">
                {errorList.length > 0
                  ? `Fix ${errorList.length === 1 ? "this" : `these ${errorList.length} things`} before you upload`
                  : "The photo wasn’t added"}
              </h4>
              {uploadError && <p className="mt-2">{uploadError}</p>}
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

          <div>
            <label htmlFor="photo-file" className={LABEL}>
              Photo
            </label>
            <p id="photo-file-hint" className={HINT}>
              A JPEG, PNG or WebP file up to 4 MB. The website saves it as a
              JPEG up to 1600 pixels across and takes out the camera details,
              including any location the phone saved in the file.
            </p>
            <FieldError id="photo-file" message={errors["photo-file"]} />
            <input
              id="photo-file"
              name="photo"
              type="file"
              accept={UPLOAD_TYPES.join(",")}
              onChange={() => clearError("photo-file")}
              aria-invalid={Boolean(errors["photo-file"])}
              aria-describedby={describedBy("photo-file", errors["photo-file"])}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:py-2 file:font-bold"
            />
          </div>

          <div>
            <label htmlFor="photo-caption" className={LABEL}>
              Caption
            </label>
            <p id="photo-caption-hint" className={HINT}>
              What the photo shows, like the leaves or the bark. Don’t say
              where in the park the plant is.
            </p>
            <FieldError id="photo-caption" message={errors["photo-caption"]} />
            <input
              id="photo-caption"
              name="caption"
              type="text"
              maxLength={MAX_CAPTION}
              onChange={() => clearError("photo-caption")}
              aria-invalid={Boolean(errors["photo-caption"])}
              aria-describedby={describedBy("photo-caption", errors["photo-caption"])}
              className="field mt-2"
            />
          </div>

          <div>
            <label htmlFor="photo-credit" className={LABEL}>
              Taken by
            </label>
            <p id="photo-credit-hint" className={HINT}>
              Shows under the photo, like “Photo: SFC field team”.
            </p>
            <FieldError id="photo-credit" message={errors["photo-credit"]} />
            <input
              id="photo-credit"
              name="credit"
              type="text"
              maxLength={MAX_CREDIT}
              onChange={() => clearError("photo-credit")}
              aria-invalid={Boolean(errors["photo-credit"])}
              aria-describedby={describedBy("photo-credit", errors["photo-credit"])}
              className="field mt-2"
            />
          </div>

          <div className="flex items-start gap-3">
            <input
              id="photo-main"
              name="main"
              type="checkbox"
              aria-describedby="photo-main-hint"
              className="mt-0.5 size-5 shrink-0 accent-forest"
            />
            <div>
              <label htmlFor="photo-main" className={LABEL}>
                Make it the main photo
              </label>
              <p id="photo-main-hint" className={HINT}>
                {photos.length === 0
                  ? "The first photo is the main one anyway."
                  : "The main photo goes first on the public page."}
              </p>
            </div>
          </div>

          <button type="submit" aria-disabled={busy} className="btn btn-primary">
            <Icon name="camera" className="size-4" />
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
        </form>
      )}
    </section>
  );
}
