import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  output: 'standalone', poweredByHeader: false,
  experimental: { externalDir: true },
  // Shared admin screens live one directory up. Use the repository as the
  // Turbopack root and its single dependency graph for every React import.
  turbopack: {
    root: path.resolve(__dirname, '..'),
    resolveAlias: {
      react: './node_modules/react',
      'react-dom': './node_modules/react-dom',
    },
  },
};
export default config;
