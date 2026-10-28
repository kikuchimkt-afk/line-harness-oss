import { describe, expect, test, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// LIFF アプリから「LINE ユーザー ID → 友だち」を引く経路のテスト。
// DB 層はモックして、ルートが「アカウント指定を DB 呼び出しへ正しく渡すか」
// 「タグを添えて返すか」だけを見る。
const dbMocks = {
  getFriends: vi.fn(),
  getFriendById: vi.fn(),
  getFriendByLineUserId: vi.fn(),
  getFriendCount: vi.fn(),
  addTagToFriend: vi.fn(),
  removeTagFromFriend: vi.fn(),
  getFriendTags: vi.fn(),
  getScenarios: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getStaffAccountIds: vi.fn(),
  staffCanAccessLineAccount: vi.fn(),
  getLineAccountById: vi.fn(),
  jstNow: vi.fn(() => '2026-09-12T00:00:00.000'),
};
vi.mock('@line-crm/db', () => dbMocks);
vi.mock('@line-crm/line-sdk', () => ({ LineClient: vi.fn() }));

const { friends } = await import('./friends.js');

type TestEnv = {
  Variables: { staff: { id: string; role: 'owner' | 'admin' | 'staff' } };
  Bindings: { DB: D1Database };
};

function setupApp(role: 'owner' | 'admin' | 'staff' = 'owner') {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('staff', { id: 'test-staff', role });
    c.env = { DB: {} as D1Database };
    await next();
  });
  app.route('/', friends);
  return app;
}

const fakeFriend = {
  id: 'friend-1',
  line_user_id: 'U0123456789abcdef',
  display_name: 'ゆみ講師',
  picture_url: null,
  status_message: null,
  is_following: 1,
  user_id: null,
  score: 0,
  created_at: '2026-09-12T03:03:00.000',
  updated_at: '2026-09-12T03:03:00.000',
  metadata: '{}',
  line_account_id: 'acc-aiko',
};

type FriendResponse = {
  success: boolean;
  error?: string;
  data?: {
    id: string;
    lineUserId: string;
    displayName: string;
    isFollowing: boolean;
    lineAccountId: string | null;
    tags: Array<{ id: string; name: string }>;
  };
};

describe('GET /api/friends/by-line-user/:lineUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.staffCanAccessLineAccount.mockResolvedValue(true);
    dbMocks.getFriendTags.mockResolvedValue([
      { id: 'tag-1', name: 'クラス_木16小2', color: '#3B82F6', created_at: '2026-09-12T00:00:00.000' },
    ]);
  });

  test('LINE ユーザー ID から友だちとタグを返す', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(fakeFriend);
    const res = await setupApp().request('/api/friends/by-line-user/U0123456789abcdef');

    expect(res.status).toBe(200);
    const body = await res.json() as FriendResponse;
    expect(body.success).toBe(true);
    expect(body.data?.id).toBe('friend-1');
    expect(body.data?.lineUserId).toBe('U0123456789abcdef');
    expect(body.data?.isFollowing).toBe(true);
    expect(body.data?.lineAccountId).toBe('acc-aiko');
    expect(body.data?.tags.map((tag) => tag.name)).toEqual(['クラス_木16小2']);
  });

  test('lineAccountId を付けると、そのアカウントに限定して引く', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(fakeFriend);
    const res = await setupApp().request('/api/friends/by-line-user/U0123456789abcdef?lineAccountId=acc-aiko');

    expect(res.status).toBe(200);
    expect(dbMocks.getFriendByLineUserId).toHaveBeenCalledWith({}, 'U0123456789abcdef', 'acc-aiko');
  });

  test('アカウント指定がなければ null を渡す（全アカウント対象）', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(fakeFriend);
    await setupApp().request('/api/friends/by-line-user/U0123456789abcdef');

    expect(dbMocks.getFriendByLineUserId).toHaveBeenCalledWith({}, 'U0123456789abcdef', null);
  });

  test('友だちが見つからなければ 404', async () => {
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);
    const res = await setupApp().request('/api/friends/by-line-user/Uunknown');

    expect(res.status).toBe(404);
    const body = await res.json() as FriendResponse;
    expect(body.success).toBe(false);
    expect(dbMocks.getFriendTags).not.toHaveBeenCalled();
  });

  test('担当アカウント外のスタッフには返さない', async () => {
    dbMocks.staffCanAccessLineAccount.mockResolvedValue(false);
    dbMocks.getFriendByLineUserId.mockResolvedValue(fakeFriend);
    const res = await setupApp('staff').request('/api/friends/by-line-user/U0123456789abcdef');

    expect(res.status).toBe(403);
  });

  test('/api/friends/:id のルートを奪わない', async () => {
    dbMocks.getFriendById.mockResolvedValue(fakeFriend);
    const res = await setupApp().request('/api/friends/friend-1');

    expect(res.status).toBe(200);
    expect(dbMocks.getFriendById).toHaveBeenCalledWith({}, 'friend-1');
    expect(dbMocks.getFriendByLineUserId).not.toHaveBeenCalled();
  });
});
