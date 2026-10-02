import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getScenarios: vi.fn(),
  getFriendById: vi.fn(),
  getLineAccountById: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  fireEvent: vi.fn(),
  applyTagRichMenuBinding: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getScenarios: mocks.getScenarios,
  getFriendById: mocks.getFriendById,
  getLineAccountById: mocks.getLineAccountById,
  enrollFriendInScenario: mocks.enrollFriendInScenario,
  jstNow: () => '2026-10-02T12:00:00.000+09:00',
}));

vi.mock('./event-bus.js', () => ({ fireEvent: mocks.fireEvent }));
vi.mock('./rich-menu-tag-binding.js', () => ({
  applyTagRichMenuBinding: mocks.applyTagRichMenuBinding,
}));

import { attachTagAndFireSideEffects } from './friend-tag-attach.js';

function makeDb(changes: number): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ meta: { changes } })),
        first: vi.fn(async () => null),
      })),
    })),
  } as unknown as D1Database;
}

describe('attachTagAndFireSideEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getScenarios.mockResolvedValue([]);
    mocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_account_id: 'account-1',
    });
    mocks.getLineAccountById.mockResolvedValue({
      channel_access_token: 'account-token',
    });
    mocks.fireEvent.mockResolvedValue(undefined);
    mocks.applyTagRichMenuBinding.mockResolvedValue({
      applied: false,
      reason: 'binding_not_found',
    });
  });

  test('applies a persisted rich-menu binding for a newly attached tag', async () => {
    const db = makeDb(1);

    await expect(
      attachTagAndFireSideEffects(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ added: true });
    expect(mocks.fireEvent).toHaveBeenCalledWith(
      db,
      'tag_change',
      {
        friendId: 'friend-1',
        eventData: { tagId: 'tag-1', action: 'add' },
      },
      'account-token',
      'account-1',
    );
    expect(mocks.applyTagRichMenuBinding).toHaveBeenCalledWith(
      db,
      'friend-1',
      'tag-1',
    );
  });

  test('retries the menu for an existing tag without duplicating tag side effects', async () => {
    const db = makeDb(0);

    await expect(
      attachTagAndFireSideEffects(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ added: false });
    expect(mocks.getScenarios).not.toHaveBeenCalled();
    expect(mocks.fireEvent).not.toHaveBeenCalled();
    expect(mocks.applyTagRichMenuBinding).toHaveBeenCalledWith(
      db,
      'friend-1',
      'tag-1',
    );
  });
});
