import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      // Playwright is a Node/Electron runtime dependency. Bundling it
      // causes Rollup to traverse its optional native fsevents binding.
      // Keep the package external and let Electron Forge package the
      // production dependency for runtime resolution.
      external: [
        'playwright',
      ],
    },
  },
});
