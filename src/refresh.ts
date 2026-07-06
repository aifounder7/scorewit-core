import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * One-command scheduled refresh: run the pack repo's pipeline scripts in
 * order, then — in CI — commit + push the refreshed outputs.
 *
 * Deploy happens automatically when the host's Git integration redeploys on
 * push. Idempotent — if a run produced no change to any tracked path, it exits
 * green without committing. Any step failure stops the run WITHOUT committing.
 */

export interface RefreshStep {
  label: string;
  cmd: string;
  args: string[];
}

export interface RefreshOptions {
  /** Repo root the steps and git commands run in. */
  root: string;
  /** Pipeline steps, in order (each must exit 0). */
  steps: RefreshStep[];
  /** Paths whose changes constitute "new data worth shipping". */
  tracked: string[];
  /** dataset meta.json — read after the steps for the commit message. */
  metaPath: string;
  /** Commit message for a data refresh, from the parsed meta. */
  commitMessage(meta: unknown): string;
  /** Expected author line: entire history must be exactly this
   *  "<name> <email>" — the identity preflight refuses to push otherwise. */
  identity: string;
  /** Commit + push (CI mode); otherwise just report local dirtiness. */
  ci: boolean;
}

function run(root: string, label: string, cmd: string, args: string[]) {
  console.log(`\n=== ${label}`);
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`${label} failed (exit ${res.status}) — stopping.`);
    process.exit(res.status ?? 1);
  }
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root }).toString().trim();
}

/** CI only: commit the refreshed outputs back to main; push triggers deploy. */
function commitAndPush(opts: RefreshOptions, meta: unknown) {
  const dirty = git(opts.root, ['status', '--porcelain', ...opts.tracked]);
  if (dirty === '') {
    console.log('No change to any tracked output — nothing to commit.');
    return;
  }
  execFileSync('git', ['add', ...opts.tracked], { cwd: opts.root });
  execFileSync('git', ['commit', '-m', opts.commitMessage(meta)], {
    cwd: opts.root,
    stdio: 'inherit',
  });
  // Identity preflight: entire history must be exactly one identity line.
  const identities = new Set(git(opts.root, ['log', '--format=%an %ae %cn %ce']).split('\n'));
  const expected = `${opts.identity} ${opts.identity}`;
  if (identities.size !== 1 || [...identities][0] !== expected) {
    console.error(
      `Identity preflight failed (found ${identities.size} identities) — refusing to push.`
    );
    process.exit(1);
  }
  run(opts.root, 'Push (host auto-deploys on push)', 'git', ['push']);
}

export function runRefresh(opts: RefreshOptions): void {
  for (const step of opts.steps) run(opts.root, step.label, step.cmd, step.args);

  const meta = JSON.parse(fs.readFileSync(opts.metaPath, 'utf8')) as unknown;
  if (opts.ci) {
    commitAndPush(opts, meta);
  } else {
    const dirty = git(opts.root, ['status', '--porcelain', ...opts.tracked]);
    const through = (meta as { maxMatchDate?: string }).maxMatchDate ?? 'latest';
    console.log(
      dirty === ''
        ? `\nUp to date — data through ${through}, no changes.`
        : `\nRebuilt locally — data through ${through}. Commit + push to deploy (or run with --ci).`
    );
  }
}
