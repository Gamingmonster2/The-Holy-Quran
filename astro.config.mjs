import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://quranbook.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
  integrations: [react()],
});
