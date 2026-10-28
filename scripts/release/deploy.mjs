#!/usr/bin/env node
// The only supported way to release this fork to production (see AGENTS.md).
//
//   node scripts/release/deploy.mjs check    # guards only, changes nothing
//   node scripts/release/deploy.mjs worker   # Worker (API, webhook, LIFF assets, cron)
//   node scripts/release/deploy.mjs admin    # admin dashboard (Cloudflare Pages)
//   node scripts/release/deploy.mjs all      # both, from the same commit
//
// It refuses to run unless the checkout is a clean `main` identical to
// `origin/main` and production still matches the last row of
// docs/DEPLOYMENTS.md, then appends a row for every release it makes.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKER_DIR = path.join(ROOT, 'apps/worker');
const WEB_DIR = path.join(ROOT, 'apps/web');
const LOG = path.join(ROOT, 'docs/DEPLOYMENTS.md');
// pnpm rewrites this file with placeholder allowBuilds entries on install;
// it does not affect the build output.
const IGNORED_DIRTY = new Set(['pnpm-workspace.yaml', 'apps/web/tsconfig.tsbuildinfo']);

const mode = process.argv[2] ?? 'check';
if (!['check', 'worker', 'admin', 'all'].includes(mode)) {
  console.error('usage: node scripts/release/deploy.mjs check|worker|admin|all');
  process.exit(2);
}

const WIN = process.platform === 'win32';
// npx is a .cmd on Windows, so commands go through the shell there; quote
// arguments so a commit message with spaces stays one argument.
const quote = (arg) => (WIN && /[\s"&|<>^()]/.test(arg) ?`"${String(arg).replace(/"/g, '\\"')}"` : arg);
// stdio: 'inherit' returns null, so fall back to ''.
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args.map(quote), { cwd: ROOT, encoding: 'utf8', shell: WIN, maxBuffer: 64 * 1024 * 1024, ...opts })?.trimEnd() ?? '';
const git = (...args) => sh('git', args);
const wrangler = (args, cwd = WORKER_DIR) => sh('npx', ['wrangler', ...args], { cwd });
const fail = (message) => { console.error(`\n停止しました: ${message}\n`); process.exit(1); };
const jst = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

// ---- configuration comes from wrangler.toml, never hard-coded ----
const toml = readFileSync(path.join(WORKER_DIR, 'wrangler.toml'), 'utf8');
const tomlVar = (key) => toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1];
const WORKER_URL = tomlVar('WORKER_PUBLIC_URL');
const ADMIN_PROJECT = tomlVar('ADMIN_PAGES_PROJECT');
if (!WORKER_URL || !ADMIN_PROJECT) fail('wrangler.toml に WORKER_PUBLIC_URL / ADMIN_PAGES_PROJECT がありません');

// ---- guard 1: one line only — a clean main identical to origin/main ----
git('fetch', '--quiet', 'origin', 'main');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
if (branch !== 'main') fail(`今のブランチは ${branch} です。main をチェックアウトし、PR を統合してから反映してください。`);
const dirty = git('status', '--porcelain').split('\n').filter(Boolean)
  .map((line) => line.slice(3)).filter((file) => !IGNORED_DIRTY.has(file));
if (dirty.length) fail(`未コミットの変更があります:\n  ${dirty.join('\n  ')}`);
const head = git('rev-parse', 'HEAD').trim();
const originMain = git('rev-parse', 'origin/main').trim();
if (head !== originMain) fail(`手元の main（${head.slice(0, 7)}）が origin/main（${originMain.slice(0, 7)}）と違います。pull / push で揃えてください。`);
const subject = git('log', '-1', '--format=%s');

// ---- guard 2: production still matches the record ----
const logRows = readFileSync(LOG, 'utf8').split('\n')
  .filter((line) => /^\| \d{4}-\d{2}-\d{2} /.test(line))
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .map((cells) => ({ target: cells[2], version: cells[3] }));
const lastRecorded = (target) => [...logRows].reverse().find((row) => row.target === target)?.version;

function liveWorkerVersion() {
  const raw = wrangler(['deployments', 'list', '--json']);
  const rows = JSON.parse(raw.slice(raw.indexOf('[')));
  const latest = rows.sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  if (latest.versions.length !== 1 || latest.versions[0].percentage !== 100) fail('Worker が段階反映中（100% でない）です。');
  return latest.versions[0].version_id;
}
function liveAdminDeployment() {
  const raw = wrangler(['pages', 'deployment', 'list', '--project-name', ADMIN_PROJECT, '--environment', 'production', '--json']);
  const rows = JSON.parse(raw.slice(raw.indexOf('[')));
  return rows[0]?.Id;
}
const checkRecorded = (target, live) => {
  const recorded = lastRecorded(target);
  if (!recorded || !live.startsWith(recorded)) {
    fail(`本番の ${target} の版（${live.slice(0, 8)}）が docs/DEPLOYMENTS.md の最後の記録（${recorded ?? 'なし'}）と違います。記録にない反映があります。原因を調べ、行を追記してから再実行してください。`);
  }
};

const targets = mode === 'all' ? ['worker', 'admin'] : mode === 'check' ? ['worker', 'admin'] : [mode];
const liveWorker = liveWorkerVersion();
const liveAdmin = liveAdminDeployment();
if (targets.includes('worker')) checkRecorded('worker', liveWorker);
if (targets.includes('admin')) checkRecorded('admin', liveAdmin);

console.log(`確認OK: main = origin/main = ${head.slice(0, 7)}「${subject}」`);
console.log(`  本番 worker ${liveWorker.slice(0, 8)} / admin ${liveAdmin.slice(0, 8)} は記録どおり`);
if (mode === 'check') process.exit(0);

const record = (target, version) => {
  appendFileSync(LOG, `| ${jst()} | ${target} | ${version.slice(0, 8)} | ${head.slice(0, 7)} | main | deploy.mjs |\n`);
  console.log(`記録しました: ${target} ${version.slice(0, 8)} ← ${head.slice(0, 7)}`);
};

// ---- release ----
if (targets.includes('worker')) {
  console.log('\n[worker] 型チェック・テスト・ビルド');
  sh('npx', ['tsc', '--noEmit'], { cwd: WORKER_DIR, stdio: 'inherit' });
  sh('npx', ['vitest', 'run'], { cwd: WORKER_DIR, stdio: 'inherit' });
  sh('npx', ['vite', 'build'], { cwd: WORKER_DIR, stdio: 'inherit' });
  wrangler(['deploy', '--config', 'dist/ecc_tokushima_harness/wrangler.json', '--keep-vars',
    '--message', `${head.slice(0, 7)} ${subject}`.slice(0, 100)]);
  const after = liveWorkerVersion();
  if (after === liveWorker) fail('Worker の版が変わっていません。反映結果を確認してください。');
  record('worker', after);
}

if (targets.includes('admin')) {
  console.log('\n[admin] ビルド');
  sh('npx', ['next', 'build'], { cwd: WEB_DIR, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_API_URL: WORKER_URL } });
  wrangler(['pages', 'deploy', 'out', '--project-name', ADMIN_PROJECT, '--branch', 'main',
    '--commit-hash', head, '--commit-message', subject.slice(0, 100), '--commit-dirty=false'], WEB_DIR);
  const after = liveAdminDeployment();
  if (after === liveAdmin) fail('管理画面の版が変わっていません。反映結果を確認してください。');
  record('admin', after);
}

console.log('\n完了。docs/DEPLOYMENTS.md の追記をコミットして main に push してください。');
