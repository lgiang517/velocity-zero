import {defineConfig} from 'vite';

// Relative base so the build works under any host/path, including the
// GitHub Pages project subpath (https://<user>.github.io/velocity-zero/).
export default defineConfig({
  base: './',
});
