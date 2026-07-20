## Summary
Add `gate.yaml`, `loop-budget.md`, and `loop-run-log.md` to `loop-sync`'s drift detector `requiredFiles` list to ensure it evaluates complete configurations and doesn't falsely report "healthy" for incomplete loops.

## Changes
- [ ] New pattern or starter (followed `templates/pattern-template.md` + updated `registry.yaml`)
- [ ] Doc / example improvement
- [x] Tool change (`loop-sync`)
- [ ] Story (includes real failure or surprise + lesson)

## Checklist (from CONTRIBUTING)
- [x] All required sections present for patterns
- [x] Links work from README, patterns/README, starters/README, docs/index
- [x] No secrets, tokens, internal company URLs
- [x] `STATE.md*` examples use `.example` suffix
- [x] Safety-related content references `docs/safety.md`
- [x] Ran `node tools/loop-audit/dist/cli.js .` (or on the starter) and addressed findings

## Testing / Dogfood
- Updated `requiredFiles` array in `tools/loop-sync/src/sync.ts`.
- Adjusted expectations in `tools/loop-sync/test/sync.test.mjs` to handle the additional missing files logic in test stubs.
- `npm test` passes for `loop-sync`.
