// Read-only production module audit. Never logs or persists authentication.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import os from 'node:os';

const version = process.argv[2] || 'fd3814c1-fdc7-44b3-b92c-79e484774923';
if (!/^[a-f0-9-]{36}$/.test(version)) throw new Error('Invalid audit version');
const account = 'a00008d32ce4899c34b8f45666b305ea';
const worker = 'ecc-tokushima-harness';
const local = path.resolve(process.argv[3] || 'apps/worker/dist/ecc_tokushima_harness');
const authPaths = [
  path.join(os.homedir(), '.wrangler/config/default.toml'),
  path.join(os.homedir(), 'AppData/Roaming/xdg.config/.wrangler/config/default.toml'),
];
const authPath = authPaths.find(p => fs.existsSync(p));
if (!authPath) throw new Error('Wrangler login configuration unavailable');
const auth = fs.readFileSync(authPath, 'utf8');
const token = auth.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
if (!token) throw new Error('Wrangler OAuth login unavailable');
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/content/v2?version=${version}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
  const error = await response.json().catch(() => null);
  console.log(JSON.stringify({ status: response.status, errorCodes: error?.errors?.map(e => e.code), oauthLength: token.length }));
  throw new Error(`Worker module read failed (HTTP ${response.status})`);
}
if (!response.headers.get('content-type')?.startsWith('multipart/form-data')) {
  throw new Error('Unexpected production module format; body not logged or saved');
}
const form = await response.formData();
const sha = data => createHash('sha256').update(data).digest('hex');
const modules = [];
const full = [];
for (const [field, item] of form.entries()) {
  if (typeof item === 'string') {
    modules.push({ field, nonFileMetadata: true, valueNotLoggedOrSaved: true });
    continue;
  }
  const bytes = Buffer.from(await item.arrayBuffer());
  const name = item.name || field;
  const relative = name.replaceAll('\\', '/');
  if (relative.startsWith('/') || relative.split('/').includes('..')) throw new Error('Unsafe module path');
  const filename = path.join(local, relative);
  const exists = fs.existsSync(filename);
  const same = exists && sha(fs.readFileSync(filename)) === sha(bytes);
  modules.push({ name, field, type: item.type, size: bytes.length, sha256: sha(bytes), localExists: exists, byteIdentical: same });
  if (item.type.includes('javascript') || relative.endsWith('.js')) full.push(bytes.toString('utf8'));
}
const code = full.join('\n');
const report = {
  auditedAt: new Date().toISOString(), worker, version,
  entrypoint: response.headers.get('cf-entrypoint'),
  operation: 'GET only; credentials and remote module contents not logged or persisted',
  modules,
  allJsModulesByteIdentical: modules.filter(m => m.name?.endsWith('.js')).every(m => m.byteIdentical),
  features: {
    weeklySlotRules: code.includes('event_weekly_slot_rules'),
    weeklySlotGenerator: code.includes('ensureWeeklyEventSlots'),
    bookingCapacityAtomicInsert: code.includes('WHERE (SELECT COUNT(*) FROM event_bookings'),
    publicPrivateInstructionRemoval: code.includes('delete publicEvent.confirmation_message_extra'),
    scenarioManualStartApi: code.includes('/manual-start'),
    scenarioEnrollApi: code.includes('/api/scenarios/:id/enroll/:friendId'),
  },
};
console.log(JSON.stringify(report, null, 2));
if (process.argv[4]) fs.writeFileSync(path.resolve(process.argv[4]), JSON.stringify(report, null, 2) + '\n');
