import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://quranbook.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
});
