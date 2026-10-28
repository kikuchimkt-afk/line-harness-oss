import { jstNow } from './utils.js';

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  role: 'owner' | 'admin' | 'staff';
  api_key: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface StaffAccountPermission {
  staff_id: string;
  line_account_id: string;
  created_at: string;
}

export interface CreateStaffInput {
  name: string;
  email?: string | null;
  role: 'owner' | 'admin' | 'staff';
}

export interface UpdateStaffInput {
  name?: string;
  email?: string | null;
  role?: 'owner' | 'admin' | 'staff';
  is_active?: number;
}

function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `lh_${hex}`;
}

export async function getStaffByApiKey(
  db: D1Database,
  apiKey: string,
): Promise<StaffMember | null> {
  return db
    .prepare('SELECT * FROM staff_members WHERE api_key = ? AND is_active = 1')
    .bind(apiKey)
    .first<StaffMember>();
}

export async function getStaffMembers(db: D1Database): Promise<StaffMember[]> {
  const result = await db
    .prepare('SELECT * FROM staff_members ORDER BY created_at ASC')
    .all<StaffMember>();
  return result.results;
}

export async function getStaffById(
  db: D1Database,
  id: string,
): Promise<StaffMember | null> {
  return db
    .prepare('SELECT * FROM staff_members WHERE id = ?')
    .bind(id)
    .first<StaffMember>();
}

function uniqueAccountIds(lineAccountIds: readonly string[] = []): string[] {
  return [...new Set(lineAccountIds.map((id) => id.trim()).filter(Boolean))];
}

export async function getStaffAccountIds(
  db: D1Database,
  staffId: string,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT line_account_id
       FROM staff_account_permissions
       WHERE staff_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(staffId)
    .all<{ line_account_id: string }>();
  return result.results.map((row) => row.line_account_id);
}

export async function getStaffAccountIdsMap(
  db: D1Database,
  staffIds: readonly string[],
): Promise<Map<string, string[]>> {
  const ids = uniqueAccountIds(staffIds);
  const map = new Map<string, string[]>();
  ids.forEach((id) => map.set(id, []));
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT staff_id, line_account_id
       FROM staff_account_permissions
       WHERE staff_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .bind(...ids)
    .all<{ staff_id: string; line_account_id: string }>();

  for (const row of result.results) {
    const list = map.get(row.staff_id) ?? [];
    list.push(row.line_account_id);
    map.set(row.staff_id, list);
  }
  return map;
}

export async function setStaffAccountIds(
  db: D1Database,
  staffId: string,
  lineAccountIds: readonly string[],
): Promise<void> {
  const ids = uniqueAccountIds(lineAccountIds);
  const now = jstNow();
  const statements = [
    db.prepare('DELETE FROM staff_account_permissions WHERE staff_id = ?').bind(staffId),
    ...ids.map((lineAccountId) =>
      db
        .prepare(
          `INSERT INTO staff_account_permissions (staff_id, line_account_id, created_at)
           VALUES (?, ?, ?)`,
        )
        .bind(staffId, lineAccountId, now),
    ),
  ];
  await db.batch(statements);
}

export async function staffCanAccessLineAccount(
  db: D1Database,
  staff: { id: string; role: 'owner' | 'admin' | 'staff' },
  lineAccountId: string,
): Promise<boolean> {
  if (staff.role === 'owner' || staff.id === 'env-owner') return true;
  const accountIds = await getStaffAccountIds(db, staff.id);
  return accountIds.includes(lineAccountId);
}

export async function createStaffMember(
  db: D1Database,
  input: CreateStaffInput,
): Promise<StaffMember> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const apiKey = generateApiKey();

  await db
    .prepare(
      `INSERT INTO staff_members (id, name, email, role, api_key, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, input.name, input.email ?? null, input.role, apiKey, now, now)
    .run();

  return (await db
    .prepare('SELECT * FROM staff_members WHERE id = ?')
    .bind(id)
    .first<StaffMember>())!;
}

export async function updateStaffMember(
  db: D1Database,
  id: string,
  input: UpdateStaffInput,
): Promise<StaffMember | null> {
  const now = jstNow();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (input.name !== undefined) { sets.push('name = ?'); values.push(input.name); }
  if (input.email !== undefined) { sets.push('email = ?'); values.push(input.email ?? null); }
  if (input.role !== undefined) { sets.push('role = ?'); values.push(input.role); }
  if (input.is_active !== undefined) { sets.push('is_active = ?'); values.push(input.is_active); }

  values.push(id);
  await db
    .prepare(`UPDATE staff_members SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return db.prepare('SELECT * FROM staff_members WHERE id = ?').bind(id).first<StaffMember>();
}

export async function deleteStaffMember(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM staff_members WHERE id = ?').bind(id).run();
}

export async function regenerateStaffApiKey(db: D1Database, id: string): Promise<string> {
  const newKey = generateApiKey();
  const now = jstNow();
  const result = await db
    .prepare('UPDATE staff_members SET api_key = ?, updated_at = ? WHERE id = ?')
    .bind(newKey, now, id)
    .run();
  if (result.meta.changes === 0) {
    throw new Error(`Staff member not found: ${id}`);
  }
  return newKey;
}

export async function countStaffByRole(db: D1Database, role: string): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM staff_members WHERE role = ?')
    .bind(role)
    .first<{ count: number }>();
  return result?.count ?? 0;
}

export async function countActiveStaffByRole(db: D1Database, role: string): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM staff_members WHERE role = ? AND is_active = 1')
    .bind(role)
    .first<{ count: number }>();
  return result?.count ?? 0;
}
