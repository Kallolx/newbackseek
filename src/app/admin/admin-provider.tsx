'use client';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';

const theme = createTheme({ primaryColor: 'indigo', defaultRadius: 'md', fontFamily: '"Inter Variable", sans-serif', headings: { fontFamily: '"Manrope Variable", sans-serif' } });

export function AdminProvider({ children }: { children: React.ReactNode }) {
  return <MantineProvider theme={theme} forceColorScheme="light"><div id="admin-root">{children}</div></MantineProvider>;
}
