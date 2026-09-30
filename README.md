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

`SportPack.notificationState` publishes a validated coverage window in `state.json` and a push-only worker.
It validates every advertised date against the emitted daily selector, including
sport-owned substitutions, and requires at least the build date plus tomorrow. It neither registers a worker nor enables reminders. World Cup's
hub writer relocates its state under `/worldcup`; the canonical shared worker is
`/notify-sw.js` at the hub root. Worker copies cache nothing and intercept no fetch.

`notifications` is separately optional and disabled unless `enabled: true` is set.
Its service origin, public VAPID key, pack/game catalog, allowed transports and app
version must be supplied explicitly. Never put a private key in a pack. Initial consent
appears only after a completed Daily round. After a confirmed Turn Off, Stats
lets a previous subscriber choose games/time and explicitly turn reminders back
on. This never prompts or subscribes on arrival and cannot bypass a pending
deletion. Game history is preserved. See the mirrored v1 contract in
SPORTPACK-AUTHORING.md for the native bridge, API and release gates. The privacy
copy follows Amendment C (270 words) and explicitly says reminders are not currently
enabled. Real provider/KV and physical-device checks remain activation gates.

### Feedback (approved brief 0034)

`FeedbackConfig` is opt-in (`enabled: false` emits no feedback markup or runtime).
Enabled clients require an HTTPS service origin and a valid portfolio pack ID.
The shared native dialog, result reaction, reveal report and Stats/footer entries
use the fixed copy in `src/render/feedback.ts`. Legal copy is conditional on the
same switch. The hub adds its two header entries at the consumer seam.

Only reaction dismissal uses sessionStorage; messages and email stay in the open
dialog until submitted or closed. Requests contain bounded context, no play
history, no user-agent string and no client tracking identifier. Optional email
is for replies. The service's separate abuse-limiting address hash is documented
in the feedback privacy paragraph. Do not enable consumers before the live
service and private archive workflow have been verified. Reminders are separate.

`verifyReportedQuestion(pack, paths, questionId)` dispatches to independent
pack checks against committed inputs. `confirmed` means a mismatch was found;
`not_confirmed` is not a dismissal of a wording concern. Missing IDs and validator
failures remain explicit. The ops workflow records the exact pack commit.

Structured `dataProviders`, `geometryProviders`, and `verbatimNotice` footer
fields separate dataset attribution from existing artwork credits.
`renderSources` produces the full provider/licence/cadence section from the same
records. Pack-owned provider catalog snapshots live in automation/data-sources.json;
scorewit-ops holds the portfolio reference. Update both in one reviewed change.

A provider with `licence: null` and `licenceUrl: null` renders "used with
attribution" without asserting a licence. Its optional scope note appears in
Sources, keeping the compact footer short. An empty licence string remains invalid.

### Feedback mailbox references

Enabled feedback builds accept `#question=<encoded question ID>` on a game root.
The fragment opens an accessible, read-only dialog using the current committed
bank's question and reveal, plus its existing citation. It does not answer a
question, modify round progress or send a feedback event. Unknown/retired IDs
show an explicit missing-reference message. IDs stay in the URL fragment rather
than query strings. This is a current-bank reference, not a historical snapshot;
the private report archive preserves validator output and the checked pack commit.

Brief 0034 amendment A adds the approved mailbox sentence to Feedback privacy
copy. Deploy this disclosure and the reference links with the service's mailbox
rollout. Disabled-feedback output remains byte-identical.
