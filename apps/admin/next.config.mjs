import { securityHeaders } from '../../security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // مفيش داعي نعلن للعالم إن ده Next — تقليل بصمة الهجوم
  poweredByHeader: false,
  // الحزم المشتركة source-only — Next بيترجمها مع التطبيق
  transpilePackages: ['@carq/ui', '@carq/api-client'],
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
