import type { NextConfig } from "next";

/**
 * GTAI needs no custom Next.js configuration in V1: no remote image hosts, no
 * rewrites, no redirects and no experimental flags. Locale routing lives in
 * `src/proxy.ts`, and the design system is plain CSS plus Tailwind.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
