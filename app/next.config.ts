import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Higgsfield CDN hosts the brand mascot and generated media.
    remotePatterns: [
      { protocol: "https", hostname: "d8j0ntlcm91z4.cloudfront.net" },
      { protocol: "https", hostname: "d2ol7oe51mr4n9.cloudfront.net" },
    ],
  },
};

export default nextConfig;
