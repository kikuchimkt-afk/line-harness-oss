import { beforeEach, describe, expect, test, vi } from 'vitest';

const pushMessageMock = vi.fn();
vi.mock('@line-crm/line-sdk', () => ({
  LineClient: class {
    pushMessage = pushMessageMock;
  },
}));

const {
  enqueueScheduledChatMessage,
  processDueScheduledChatMessages,
  _internals,
} = await import('./scheduled-chat-messages.js');

interface FakeStatement {
  sql: string;
  bound: unknown[];
  bind: (...values: unknown[]) => FakeStatement;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
}

function makeStatement(
  sql: string,
  dueRows: Record<string, unknown>[],
  onRun: (statement: FakeStatement) => number,
): FakeStatement {
  const statement: FakeStatement = {
    sql,
    bound: [],
    bind(...values: unknown[]) {
      statement.bound = values;
      return statement;
    },
    async all<T>() {
      return {
        results: sql.includes('FROM scheduled_chat_messages q')
          ? dueRows as T[]
          : [],
      };
    },
    async run() {
      return { success: true, meta: { changes: onRun(statement) } };
    },
  };
  return statement;
}

beforeEach(() => {
  pushMessageMock.mockReset();
});

describe('scheduled chat messages', () => {
  test('enqueue stores the schedule and mute flag', async () => {
    let inserted: FakeStatement | null = null;
    const db = {
      prepare(sql: string) {
        const statement = makeStatement(sql, [], (current) => {
          inserted = current;
          return 1;
        });
        return statement;
      },
    } as unknown as D1Database;

    const id = await enqueueScheduledChatMessage(db, {
      chatId: 'chat-1',
      friendId: 'friend-1',
      lineAccountId: 'account-1',
      messageType: 'text',
      content: '明日のご案内です',
      scheduledAt: '2099-06-01T00:00:00.000Z',
      notificationDisabled: true,
    });

    expect(id).toEqual(expect.any(String));
    expect(inserted?.bound).toEqual([
      id,
      'chat-1',
      'friend-1',
      'account-1',
      'text',
      '明日のご案内です',
      '2099-06-01T00:00:00.000Z',
      1,
    ]);
  });

  test('due message is sent muted and written to chat history', async () => {
    const dueRows = [{
      id: 'queue-1',
      chat_id: 'chat-1',
      friend_id: 'friend-1',
      line_account_id: 'account-1',
      message_type: 'text',
      content: '予約したメッセージ',
      notification_disabled: 1,
      retry_count: 0,
      channel_access_token: 'account-token',
      line_user_id: 'U123',
    }];
    const batchSql: string[] = [];
    const db = {
      prepare(sql: string) {
        return makeStatement(sql, dueRows, (statement) => (
          statement.sql.includes('retry_count = retry_count + 1') ? 1 : 1
        ));
      },
      async batch(statements: FakeStatement[]) {
        batchSql.push(...statements.map((statement) => statement.sql));
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      },
    } as unknown as D1Database;

    const result = await processDueScheduledChatMessages(db, {
      now: new Date('2099-06-01T00:05:00.000Z'),
      defaultChannelAccessToken: 'default-token',
    });

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(pushMessageMock).toHaveBeenCalledWith(
      'U123',
      [{ type: 'text', text: '予約したメッセージ' }],
      { notificationDisabled: true },
    );
    expect(batchSql.some((sql) => sql.includes('INSERT INTO messages_log'))).toBe(true);
    expect(batchSql.some((sql) => sql.includes('UPDATE chats'))).toBe(true);
    expect(batchSql.some((sql) => sql.includes("status = 'sent'"))).toBe(true);
  });

  test('image payload is restored as a LINE image message', () => {
    expect(
      _internals.buildLineMessage(
        'image',
        JSON.stringify({
          originalContentUrl: 'https://example.com/original.jpg',
          previewImageUrl: 'https://example.com/preview.jpg',
        }),
      ),
    ).toEqual({
      type: 'image',
      originalContentUrl: 'https://example.com/original.jpg',
      previewImageUrl: 'https://example.com/preview.jpg',
    });
  });
});
