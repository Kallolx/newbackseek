import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  output: 'standalone', poweredByHeader: false,
  experimental: { externalDir: true },
  // Shared admin screens live one directory up. Use the repository as the
  // Turbopack root, but make every import use this app's single React copy.
  turbopack: {
    root: path.resolve(__dirname, '..'),
    resolveAlias: {
      react: './admin/node_modules/react',
      'react-dom': './admin/node_modules/react-dom',
    },
  },
};
export default config;
