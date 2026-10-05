import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6"
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 self-start rounded-md font-bold"
      >
        <LogoMark />
        Niah Plant Records
      </Link>
      <p className="eyebrow mt-12">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        We can’t find that page
      </h1>
      <p className="mt-3 text-moss">
        The link might be old, or the address might have a typo in it.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Go to the home page
        </Link>
        <Link href="/screens" className="btn btn-secondary">
          See every screen
        </Link>
      </div>
    </main>
  );
}
