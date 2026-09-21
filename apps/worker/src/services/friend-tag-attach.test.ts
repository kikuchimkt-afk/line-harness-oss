import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getScenarios: vi.fn().mockResolvedValue([]),
  enrollFriendInScenario: vi.fn().mockResolvedValue(undefined),
  jstNow: vi.fn(() => '2026-09-22T12:00:00.000+09:00'),
}));

const fireEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@line-crm/db', () => dbMocks);
vi.mock('./event-bus.js', () => ({ fireEvent }));

const { attachTagAndFireSideEffects } = await import('./friend-tag-attach.js');

function makeDb(changes: number): D1Database {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async run() {
          return { meta: { changes } };
        },
        async first() {
          return null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('attachTagAndFireSideEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getScenarios.mockResolvedValue([]);
  });

  it('fires tag_change add side effects only when the tag is newly inserted', async () => {
    const db = makeDb(1);

    await expect(attachTagAndFireSideEffects(db, 'friend-1', 'tag-1')).resolves.toEqual({
      added: true,
    });

    expect(fireEvent).toHaveBeenCalledWith(db, 'tag_change', {
      friendId: 'friend-1',
      eventData: { tagId: 'tag-1', action: 'add' },
    });
  });

  it('does not repeat side effects when INSERT OR IGNORE reports an existing tag', async () => {
    const db = makeDb(0);

    await expect(attachTagAndFireSideEffects(db, 'friend-1', 'tag-1')).resolves.toEqual({
      added: false,
    });

    expect(dbMocks.getScenarios).not.toHaveBeenCalled();
    expect(fireEvent).not.toHaveBeenCalled();
  });
});
