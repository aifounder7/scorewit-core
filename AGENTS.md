# @scorewit/core agent guide

This repository is the sport-agnostic engine shared by every Scorewit pack. Read `README.md`, `FIREWALL.md`, `VOICE.md`, `METRICS.md`, and `SPORTPACK-AUTHORING.md` before making a substantive change.

## Non-negotiables

- Core owns mechanisms only. Sport facts, labels, datasets, and editorial choices belong in packs.
- Preserve deterministic generation: seeded RNG only, byte-stable outputs for identical inputs, and no `Math.random` in content paths.
- Every emitted fact must be independently re-derived by validation. Never share derivation helpers across emit and validate paths; follow `FIREWALL.md`.
- Keep client state anonymous and device-local. No accounts, tracking IDs, cookies, fingerprints, or PII.
- Default-safe optional behavior is required: an unset pack option must preserve existing output.
- Every write goes through a pull request; the founder merges. Commits use `Jay <292566361+aifounder7@users.noreply.github.com>`.
- Do not duplicate an existing branch, PR, tag, or brief. Verify and augment it instead. Never move a published version tag.

Run `npm run typecheck` and `npm test` before pushing. Add a focused regression test for every behavioral fix, and prove it fails against the pre-fix code when practical.
