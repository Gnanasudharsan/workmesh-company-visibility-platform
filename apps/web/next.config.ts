import type { NextConfig } from "next";
import { resolve } from "node:path";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8020";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src 'self' ${api} ${api.replace(/^http/, "ws")}`,
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@workmesh/core"],
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, "../.."),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
