import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Newsreader,
} from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Atkinson Hyperlegible was made by the Braille Institute to be easy to read,
// which matters for rangers reading a screen outdoors. Newsreader italic is
// only used for Latin plant names.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: "italic",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "Niah Plant Records",
    template: "%s · Niah Plant Records",
  },
  description:
    "Clickable wireframe of the plant records website for Niah National Park. A COS30049 student project, everything on it is mock data.",
};

export const viewport: Viewport = {
  themeColor: "#f5f7f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${atkinson.variable} ${atkinsonMono.variable} ${newsreader.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-md bg-sheet px-4 py-2 font-bold shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
        <div className="bg-tape px-4 py-1.5 text-center font-mono text-[0.6875rem] font-bold uppercase leading-snug tracking-[0.08em] text-tape-ink">
          <p>
            Wireframe for our Sprint 1 review
            <span aria-hidden="true"> · </span>
            <span className="sr-only">. </span>
            Mock data, nothing is saved
            <span aria-hidden="true"> · </span>
            <span className="sr-only">. </span>
            <Link
              href="/screens"
              className="underline decoration-2 underline-offset-2 hover:no-underline"
            >
              See every screen
            </Link>
          </p>
        </div>
        {children}
      </body>
    </html>
  );
}
