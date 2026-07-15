import { getStaffAccountIds, staffCanAccessLineAccount } from '@line-crm/db';
import type { LineAccount } from '@line-crm/db';
import type { Context } from 'hono';
import type { Env } from '../index.js';

export async function canAccessLineAccount(c: Context<Env>, lineAccountId: string): Promise<boolean> {
  const staff = c.get('staff');
  if (!staff) return false;
  return staffCanAccessLineAccount(c.env.DB, staff, lineAccountId);
}

/**
 * Returns null when the current staff can see every account (owner / legacy
 * unrestricted staff), otherwise the concrete account ids they may operate.
 */
export async function getAllowedLineAccountIds(c: Context<Env>): Promise<string[] | null> {
  const staff = c.get('staff');
  if (!staff || staff.role === 'owner' || staff.id === 'env-owner') return null;

  const accountIds = await getStaffAccountIds(c.env.DB, staff.id);
  if (accountIds.length === 0) return null; // Legacy unrestricted staff/admin.

  return accountIds;
}

export async function denyIfLineAccountOutsideScope(
  c: Context<Env>,
  lineAccountId: string | null | undefined,
): Promise<Response | null> {
  if (!lineAccountId) {
    const allowedIds = await getAllowedLineAccountIds(c);
    if (allowedIds === null) return null;
    return c.json(
      { success: false, error: 'このLINEアカウントを操作する権限がありません' },
      403,
    );
  }
  return denyIfCannotAccessLineAccount(c, lineAccountId);
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
