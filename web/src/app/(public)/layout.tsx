import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { LogoMark } from "@/components/logo";
import { NavLink } from "@/components/nav-link";

const NAV_LINK =
  "inline-flex min-h-11 items-center rounded-md px-3 font-bold text-moss transition-colors hover:text-ink aria-[current=page]:bg-forest-soft aria-[current=page]:text-forest-deep";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-sheet">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:gap-x-6 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md py-1 font-bold tracking-tight"
          >
            <LogoMark />
            Niah Plant Records
          </Link>
          <nav
            aria-label="Main"
            className="order-last -mx-3 w-[calc(100%+1.5rem)] sm:order-none sm:mx-0 sm:w-auto"
          >
            <ul className="flex gap-1">
              <li>
                <NavLink href="/plants" className={NAV_LINK}>
                  Plants
                </NavLink>
              </li>
              <li>
                <NavLink href="/tag" className={NAV_LINK}>
                  Scan a tag
                </NavLink>
              </li>
            </ul>
          </nav>
          <Link href="/login" className="btn btn-secondary ml-auto">
            Staff sign in
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-moss sm:flex-row sm:justify-between sm:px-6">
          <div className="max-w-xl space-y-1">
            <p>
              <span className="font-bold text-ink">Niah Plant Records</span> is
              a COS30049 student project for Sarawak Forestry Corporation and
              NeuonAI. It isn’t an official SFC website.
            </p>
            <p>All the records and people on it are made up.</p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link
                href="/screens"
                className="font-bold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                Every screen
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/UmerNaseer2/niah-biodiversity-system"
                className="inline-flex items-center gap-1 font-bold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                Code on GitHub
                <Icon name="external" className="size-4" />
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
