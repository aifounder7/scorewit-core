# @scorewit/core

Sport-agnostic engine for Scorewit daily trivia apps. A sport plugs in as a
`SportPack`; the core runs the deterministic content pipeline and renders the
single-file web app.

## What it does

```
ingest    → the pack pulls its upstream source and returns a normalized
            dataset + coverage metadata; the core commits them to disk
            (the dataset is the ONLY source of truth for every fact)
generate  → template-generate the question bank and per-entity / matchday
            artifacts from the dataset. Seeded RNG only (mulberry32 +
            FNV-1a string hash), never Math.random — output is
            deterministic given the dataset
validate  → INDEPENDENT re-derivation of every fact from the dataset via
            the pack's per-check-kind functions — not a schema check.
            Fails loudly, exits non-zero
render    → emit the deployable single-file app (HTML shell with the bank,
            artifacts, brand, and copy inlined) plus 404 page and manifest
```

Also included: the streak/stats model and day-scoped in-progress round
persistence (tested), a scoped-quiz giveaway guard, multiple-choice option
plumbing, and a CI refresh wrapper (re-run pipeline, commit + push only when
tracked outputs changed, with an identity preflight).

## The SportPack interface

A pack is generic over its match/entity type `M`, edition key `E`
(number- or string-keyed — no normalization), topic union `T`, and
provenance-check union `C`:

```ts
interface SportPack<M, E extends EditionKey, T extends string, C, DS> {
  id: string;
  brand: Brand;                 // app name/url, mark SVG, palette
  copy: AppCopy;                // tagline, disclaimer, OG/meta, UI strings
  clientJs: PackClientJs;       // sport-owned client render chunks
  assets: AssetSpec;            // files copied into the deployed site
  config: PackConfig<T>;        // dailyCount, artifactSuffix, timezone, seed, quotas
  ingest(env): Promise<{ tournaments: Tournament<M, E>[]; meta: Coverage<E> }>;
  loadDataset(raw): DS;
  feedsTrivia(m: M): boolean;
  result: ResultDeriver<M>;     // winner/loser/margin/scoreline text
  tier(edition: E, topic: T): Difficulty;
  generators: Record<T, (ds: DS, rng: Rng) => Question<T, C>[]>;
  checks: Record<string, (q, ds) => string[]>;   // per-check-kind re-derivation
  questionGuards(q, ds, coverage): string[];     // era / in-progress-edition gates
  validateGuards(ctx): ValidationError[];        // artifact guards + firewalls
  bankCoverage(meta): unknown;                   // coverage block embedded in the bank
  team(ds, questions, coverage): TeamsArtifactLike;
  matchday(ds, coverage, questions, today): MatchdayArtifactLike;
}
```

The core stays free of sport facts: every fact, label, and editorial choice
(alias maps, flags, copy) lives in the pack.

## Usage

```ts
import { defaultPaths, runPipeline } from '@scorewit/core';
import { myPack } from './pack';

await runPipeline(myPack, defaultPaths(rootDir));
// or stage-by-stage: runIngest / runGenerate / runValidate / runRender
```

## Determinism rules

- No `Math.random`; all shuffles route through the seeded `Rng`.
- `generate` output is byte-stable for a given dataset + seed (only
  date-windowed artifacts move with the build date, by design).
- `validate` must re-derive answers with logic independent of the
  generators, so a bug in a shared derivation cannot hide.

## Develop

```
npm install
npm run typecheck
npm test          # streak/stats model cases
```

## Optional installation surfaces

`SportPack.installPromo` enables a quiet arrival action and a post-round card.
Consumers supply the app name, embedded original mark, eyebrow, title, body and
canonical `gamePath`. The head captures native install eligibility early; a
user click invokes the one-shot prompt. Native destinations stay hidden until
the browser supplies an event.
The card is hidden during questions, after installation and in standalone mode.
`Not now` and native cancellation suppress cards across the origin for 30 days;
the quiet arrival action still supports an intentional retry. No install
analytics or network requests are added. Storage failure is nonfatal.

Hub consumers reuse `installHead`, `renderInstallCard` and `INSTALL_CSS`.
`installedHubHead` accepts an allowlist of local game paths and storage prefixes.
Answers write `scorewit.lastPlayed` locally. Cold installed hub launches resume
that game; legacy saves fall back to a unique latest played day. Ties stay on
the chooser. `?games=1`, anchor links and same-origin arrivals bypass resume;
use `FooterConfig.allGamesUrl` for an explicit chooser link.

`SportPack.pwa` opts into shared-origin scope `/` and an optional manifest name.
It never changes an existing ID or start URL. `assertPublishedManifestIdentity`
locks all eight published IDs, including their exact trailing slashes. Custom
manifest writers must call the guard on the final manifest, after retargeting.
Unsupported browsers retain ordinary gameplay and browser-menu installation.
Actual native installation and installed cross-game navigation need Android
and iOS device verification after deployment; browser tests do not prove OS behavior.

`installPromo.destinations` holds platform data for one component. Android and
desktop currently use `{ kind: 'native', label: 'Install' }`; iOS uses
`{ kind: 'manual', label: 'Add to Home Screen' }`. An optional action `body`
overrides the shared card copy (desktop describes installation, not a phone's
home screen). Omitting destinations retains native-only behavior. iPad desktop
user agents are recognized through their Mac platform and touch capability.

The manual action opens a native dialog with Safari steps and an expandable
copy-link aid, expanded by default outside recognizable Safari. Copy uses the
current origin and canonical game root, never query strings or share tokens.
Clipboard failure selects a readable link for manual copying. Close/Escape
returns focus; Done applies the shared cooldown without marking installation.
Observed standalone use suppresses future manual cards in that same available
local storage. iOS cannot reliably report every existing install to an ordinary
browser tab; no universal installation-detection claim is made.

Future Android/iOS listings can select `{ kind: 'store', label, body, url }`.
Build-time validation requires a matching HTTPS Play/App Store listing URL,
explicit action copy and a store-specific body. The URL format guard does not
verify that a listing is published: verify the real destination before enabling.
Store navigation happens only on click and is not counted as installation.
Desktop remains native web installation. No production store destination or
badge is configured. When a Play listing exists, update related applications
and preference metadata in the same reviewed rollout; preserve all manifest IDs.
Do not add a service worker as part of this promotion.

Safari steps follow [Apple's iPhone instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)
and [iPad instructions](https://support.apple.com/guide/ipad/bookmark-a-website-ipadc602b75b/ipados).
Browser store preference is a hint, as described by
[MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/prefer_related_applications).


## Notification foundation (disabled)

`SportPack.notificationState` publishes dated `state.json` and a push-only worker.
It validates readiness against the emitted daily selector, including sport-owned
substitutions. It neither registers a worker nor enables reminders. World Cup's
hub writer relocates its state under `/worldcup`; the canonical shared worker is
`/notify-sw.js` at the hub root. Worker copies cache nothing and intercept no fetch.

`notifications` is separately optional and disabled unless `enabled: true` is set.
Its service origin, public VAPID key, pack/game catalog, allowed transports and app
version must be supplied explicitly. Never put a private key in a pack. Consent
appears only after a completed Daily round. See the mirrored v1 contract in
SPORTPACK-AUTHORING.md for the native bridge, API and release gates. The privacy
copy in this release is a review proposal and explicitly says reminders are not
currently enabled. It must be approved before merging or activating the service.
