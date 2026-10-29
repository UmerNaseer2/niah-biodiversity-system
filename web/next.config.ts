import type { NextConfig } from "next";

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
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
