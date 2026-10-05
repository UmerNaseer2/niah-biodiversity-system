import Link from "next/link";

export default function TagNotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
      <p className="eyebrow">Tag lookup</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        No plant with that tag yet
      </h1>
      <p className="mt-3 text-moss">
        Check the code against the tag. If it matches, the plant was probably
        recorded recently. New records only show up here after a conservation
        officer approves them.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/tag" className="btn btn-primary">
          Try another code
        </Link>
        <Link href="/plants" className="btn btn-secondary">
          Browse plants
        </Link>
      </div>
    </div>
  );
}
