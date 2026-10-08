/** @type {import('next').NextConfig} */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const normalizedBasePath = rawBasePath.startsWith("/")
  ? rawBasePath.replace(/\/+$/, "")
  : rawBasePath
  ? "/" + rawBasePath.replace(/\/+$/, "")
  : "";

const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  skipTrailingSlashRedirect: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  basePath: normalizedBasePath || undefined,
  assetPrefix: normalizedBasePath ? `${normalizedBasePath}/` : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
      {
        protocol: "http",
        hostname: "minio",
      },
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;

