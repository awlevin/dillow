import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow the photo CDNs. The hero uses a custom rdcpix loader (CDN-side
    // resize, no Vercel optimization spend); these patterns cover any plain
    // <img>/Image usage too.
    remotePatterns: [
      { protocol: "https", hostname: "*.rdcpix.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
    ],
  },
};

export default nextConfig;
