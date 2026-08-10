## Tasks

- [x] Delete `_depthIndex` function in `playback.js` (lines ~585-596)
- [x] Rename `.depth =` to `.zIndex =` at 6 creation sites in `playback.js`
- [x] Simplify `updateUpcoming` to use `addChild` without the `.depth → .zIndex` copy
- [x] Inline `createJudgement`'s depth parameter (always `4`)
- [x] Verify: `npm run build` passes
- [x] Verify: `npm run test:game` passes (render order unchanged)