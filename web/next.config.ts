import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

// Photos come from the Supabase project and from outside https links on a
// species, and the map tiles from OpenStreetMap, so any https picture is let
// in. The local stand-in runs Supabase on http with `npm run dev`, so its
// address goes in too. A production build never uses an http Supabase URL
// (see src/lib/supabase/config.ts), so it never gets one.
const supabaseHttp = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "");
    return dev && url.protocol === "http:" ? ` ${url.origin}` : "";
  } catch {
    return "";
  }
})();

// What the browser is allowed to load on our pages. Next.js puts small inline
// scripts in every page and the report and battery bars use style attributes,
// so both still need 'unsafe-inline'. A nonce would mean rendering every page on each
// request (see the Next.js CSP guide). The dev server also needs 'unsafe-eval'
// for React's error overlay.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https:${supabaseHttp}`,
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // No X-Powered-By header, so responses don't say which framework we run
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Species photos (item 18) can be up to 4 MB, and the form around the
      // file adds a little. Vercel doesn't take requests over 4.5 MB anyway.
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
            : []),
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // The website never needs the camera, microphone or location
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
