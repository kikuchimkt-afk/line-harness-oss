import { getStaffAccountIds, staffCanAccessLineAccount } from '@line-crm/db';
import type { LineAccount } from '@line-crm/db';
import type { Context } from 'hono';
import type { Env } from '../index.js';

export async function canAccessLineAccount(c: Context<Env>, lineAccountId: string): Promise<boolean> {
  const staff = c.get('staff');
  if (!staff) return false;
  return staffCanAccessLineAccount(c.env.DB, staff, lineAccountId);
}

export async function denyIfCannotAccessLineAccount(
  c: Context<Env>,
  lineAccountId: string,
): Promise<Response | null> {
  if (await canAccessLineAccount(c, lineAccountId)) return null;
  return c.json(
    { success: false, error: 'このLINEアカウントを操作する権限がありません' },
    403,
  );
}

export async function filterAccessibleLineAccounts(
  c: Context<Env>,
  accounts: LineAccount[],
): Promise<LineAccount[]> {
  const staff = c.get('staff');
  if (!staff || staff.role === 'owner' || staff.id === 'env-owner') return accounts;

  const accountIds = await getStaffAccountIds(c.env.DB, staff.id);
  if (accountIds.length === 0) return accounts; // Legacy unrestricted staff/admin.

  const allowed = new Set(accountIds);
  return accounts.filter((account) => allowed.has(account.id));
}
