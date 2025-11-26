/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export a fully static site for Netlify; pages fetch data client-side via Firebase.
  output: "export",
};

module.exports = nextConfig;
