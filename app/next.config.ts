import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binaries resolve paths relative to their packages; keep them out of the bundle.
  serverExternalPackages: ["ffmpeg-static", "sharp"],
  // The project page's server actions spawn ffmpeg and rasterize Hebrew with the
  // bundled font; neither is imported, so ship them with that function explicitly.
  outputFileTracingIncludes: {
    "/app/projects/*": ["./node_modules/ffmpeg-static/ffmpeg", "./assets/fonts/**"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  images: {
    // Higgsfield CDN hosts the brand mascot and generated media.
    remotePatterns: [
      { protocol: "https", hostname: "d8j0ntlcm91z4.cloudfront.net" },
      { protocol: "https", hostname: "d2ol7oe51mr4n9.cloudfront.net" },
    ],
  },
};

export default nextConfig;
