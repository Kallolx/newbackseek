import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  // Produces a compact Node server that is ideal for our VPS container.
  output: 'standalone',
};
export default config;
