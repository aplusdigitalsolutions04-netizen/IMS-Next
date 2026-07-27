/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["puppeteer"],
  // Hides the dev-mode route indicator badge (bottom-left "N" circle).
  devIndicators: false,
};

export default nextConfig;
