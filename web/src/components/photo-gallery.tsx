import { mainPhoto, type SpeciesPhoto } from "@/lib/species-photos";

// Species photos (item 18). These are plain <img> tags rather than
// next/image, because the image optimizer won't fetch from a local address,
// which is where Supabase runs when we test. Uploads are already cut down to
// 1600px JPEGs when they're saved.

function Photo({
  photo,
  large = false,
  className = "",
}: {
  photo: SpeciesPhoto;
  large?: boolean;
  className?: string;
}) {
  return (
    <figure className={className}>
      <a
        href={photo.src}
        className="block overflow-hidden rounded-lg border border-line bg-paper"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see the note at the top */}
        <img
          src={photo.src}
          alt={photo.caption}
          loading={large ? "eager" : "lazy"}
          decoding="async"
          className={`w-full object-cover ${large ? "aspect-[4/3]" : "aspect-square"}`}
        />
      </a>
      <figcaption className={`mt-2 text-moss ${large ? "text-sm" : "text-xs"}`}>
        <span className="text-ink">{photo.caption}</span> Photo: {photo.credit}
      </figcaption>
    </figure>
  );
}

/** Just the main photo, for the tag page */
export function MainPhoto({
  photos,
  className = "",
}: {
  photos: SpeciesPhoto[];
  className?: string;
}) {
  const main = mainPhoto(photos);
  if (!main) return null;
  return <Photo photo={main} large className={className} />;
}

/** The main photo big, with the rest under it. Each one opens the full photo. */
export function PhotoGallery({ photos }: { photos: SpeciesPhoto[] }) {
  const main = mainPhoto(photos);
  if (!main) return null;
  const rest = photos.filter((photo) => photo !== main);

  return (
    <div className="space-y-4">
      <Photo photo={main} large />
      {rest.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rest.map((photo, index) => (
            // Two outside links can be the same, so the index goes in too
            <li key={`${index}-${photo.key}`}>
              <Photo photo={photo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
