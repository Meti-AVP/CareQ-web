/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // الحزم المشتركة source-only — Next بيترجمها مع التطبيق
  transpilePackages: ['@carq/ui', '@carq/api-client'],
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
};

export default nextConfig;
