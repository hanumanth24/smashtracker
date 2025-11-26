/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export a fully static site for Netlify; pages fetch data client-side via Firebase.
  output: "export",
  // Use relative asset paths so the exported site works in static hosts and previews.
  assetPrefix: ".",
};

module.exports = nextConfig;
