/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLintによる警告を無視してビルドを続行
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
