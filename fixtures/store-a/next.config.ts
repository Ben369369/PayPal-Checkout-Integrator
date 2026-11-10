import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain dynamic rendering (no Cache Components): every page reads the cart
  // or orders from the database on each request.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
