import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package is TypeScript source in the monorepo.
  transpilePackages: ["@paypal-checkout-integrator/shared"],
  serverExternalPackages: ["pg-boss"],
};

export default nextConfig;
