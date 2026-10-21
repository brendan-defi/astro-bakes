import type { NextConfig } from "next";
import { ADMIN_HOST } from "./src/lib/hosts";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * The admin host serves the admin portal and nothing else: its root opens
   * the dashboard, and any shop path goes to the shop (so admin.astrobakes.xyz/en
   * never renders the storefront). /_next, the icons and robots.txt stay put.
   * Production 404s /admin on every other host in src/proxy.ts.
   */
  async redirects() {
    const onAdminHost = [{ type: "host" as const, value: ADMIN_HOST }];
    return [
      { source: "/", has: onAdminHost, destination: "/admin", permanent: false },
      {
        source: "/:path((?!admin(?:/|$)|_next/|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|robots\\.txt$).*)",
        has: onAdminHost,
        destination: "https://astrobakes.xyz/:path",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [{ source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
