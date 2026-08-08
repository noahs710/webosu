# Tasks: tailwind-v4-migration

- [ ] T1: Install `@tailwindcss/vite`, remove `lit`, `postcss`, `autoprefixer` from package.json
- [ ] T2: Add `@tailwindcss/vite()` to vite.config.mjs plugins array
- [ ] T3: Update `src/vue/styles.css` — replace `@tailwind base/components/utilities` with `@import "tailwindcss"`, move lazer colors into `@theme {}`
- [ ] T4: Delete `postcss.config.js` and `tailwind.config.js`
- [ ] T5: Verify build + all tests pass
