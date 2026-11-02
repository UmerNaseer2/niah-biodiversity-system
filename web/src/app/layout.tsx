import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Newsreader,
} from "next/font/google";
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
    "Look up the plants of Niah National Park and scan a plant's tag.",
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
        {children}
      </body>
    </html>
  );
}
