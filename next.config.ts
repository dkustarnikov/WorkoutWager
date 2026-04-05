import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    // Use the separate tsconfig for Next.js
    tsconfigPath: './tsconfig.next.json',
  },
}

export default nextConfig
