/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The built-in database driver is a native module: load it from node_modules instead of bundling it.
  experimental: { serverComponentsExternalPackages: ['better-sqlite3'] },
};
module.exports = nextConfig;
