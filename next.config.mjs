/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a test build run beside the dev server: NEXT_DIST_DIR=.next-build next build
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  serverExternalPackages: ["puppeteer", "jimp"],
  // Hides the dev-mode route indicator badge (bottom-left "N" circle).
  devIndicators: false,
};

export default nextConfig;
