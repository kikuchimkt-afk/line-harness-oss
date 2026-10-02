import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFriendById: vi.fn(),
  getActiveTagRichMenuBinding: vi.fn(),
  getRichMenuGroupWithPages: vi.fn(),
  getLineAccountById: vi.fn(),
  linkRichMenuToUser: vi.fn(),
  getRichMenuIdOfUser: vi.fn(),
  unlinkRichMenuFromUser: vi.fn(),
  lineClientConstructor: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getFriendById: mocks.getFriendById,
  getActiveTagRichMenuBinding: mocks.getActiveTagRichMenuBinding,
  getRichMenuGroupWithPages: mocks.getRichMenuGroupWithPages,
  getLineAccountById: mocks.getLineAccountById,
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: class {
    constructor(token: string) {
      mocks.lineClientConstructor(token);
    }

    linkRichMenuToUser = mocks.linkRichMenuToUser;
    getRichMenuIdOfUser = mocks.getRichMenuIdOfUser;
    unlinkRichMenuFromUser = mocks.unlinkRichMenuFromUser;
  },
}));

import {
  applyTagRichMenuBinding,
  reconcileTagRichMenuAfterRemoval,
} from './rich-menu-tag-binding.js';

const db = {} as D1Database;

function followingFriend(overrides: Record<string, unknown> = {}) {
  return {
    id: 'friend-1',
    line_user_id: 'U123',
    line_account_id: 'account-1',
    is_following: 1,
    ...overrides,
  };
}

function publishedGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    account_id: 'account-1',
    status: 'published',
    default_page_id: 'page-2',
    pages: [
      { id: 'page-1', order_index: 0, line_richmenu_id: 'richmenu-old' },
      { id: 'page-2', order_index: 1, line_richmenu_id: 'richmenu-current' },
    ],
    ...overrides,
  };
}

describe('applyTagRichMenuBinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFriendById.mockResolvedValue(followingFriend());
    mocks.getActiveTagRichMenuBinding.mockResolvedValue({
      account_id: 'account-1',
      tag_id: 'tag-1',
      rich_menu_group_id: 'group-1',
      is_active: 1,
    });
    mocks.getRichMenuGroupWithPages.mockResolvedValue(publishedGroup());
    mocks.getLineAccountById.mockResolvedValue({ channel_access_token: 'secret-token' });
    mocks.linkRichMenuToUser.mockResolvedValue(undefined);
    mocks.getRichMenuIdOfUser.mockResolvedValue({ richMenuId: 'richmenu-current' });
    mocks.unlinkRichMenuFromUser.mockResolvedValue(undefined);
  });

  test('resolves the latest published default page and links it with the account token', async () => {
    await expect(
      applyTagRichMenuBinding(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({
      applied: true,
      groupId: 'group-1',
      richMenuId: 'richmenu-current',
    });

    expect(mocks.lineClientConstructor).toHaveBeenCalledWith('secret-token');
    expect(mocks.linkRichMenuToUser).toHaveBeenCalledWith('U123', 'richmenu-current');
  });

  test('does not call LINE for a friend who is not currently following', async () => {
    mocks.getFriendById.mockResolvedValue(followingFriend({ is_following: 0 }));

    await expect(
      applyTagRichMenuBinding(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ applied: false, reason: 'not_following' });
    expect(mocks.linkRichMenuToUser).not.toHaveBeenCalled();
  });

  test('does not cross LINE account boundaries', async () => {
    mocks.getRichMenuGroupWithPages.mockResolvedValue(
      publishedGroup({ account_id: 'another-account' }),
    );

    await expect(
      applyTagRichMenuBinding(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ applied: false, reason: 'group_not_published' });
    expect(mocks.linkRichMenuToUser).not.toHaveBeenCalled();
  });

  test('does not link a draft group', async () => {
    mocks.getRichMenuGroupWithPages.mockResolvedValue(
      publishedGroup({ status: 'draft' }),
    );

    await expect(
      applyTagRichMenuBinding(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ applied: false, reason: 'group_not_published' });
    expect(mocks.linkRichMenuToUser).not.toHaveBeenCalled();
  });

  test('unlinks only when the removed tag owns the current per-user menu', async () => {
    const removalDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first: vi.fn(async () => null) })),
      })),
    } as unknown as D1Database;

    await expect(
      reconcileTagRichMenuAfterRemoval(removalDb, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ changed: true, action: 'unlinked' });
    expect(mocks.unlinkRichMenuFromUser).toHaveBeenCalledWith('U123');
  });

  test('preserves a different menu that was linked after the removed tag menu', async () => {
    mocks.getRichMenuIdOfUser.mockResolvedValue({ richMenuId: 'richmenu-manual' });

    await expect(
      reconcileTagRichMenuAfterRemoval(db, 'friend-1', 'tag-1'),
    ).resolves.toEqual({ changed: false, reason: 'current_menu_changed' });
    expect(mocks.unlinkRichMenuFromUser).not.toHaveBeenCalled();
  });
});
