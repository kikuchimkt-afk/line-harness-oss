import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTagWithBlockEnforcement } from './block-tag-attach.js';
import { processBlockedFriendMenuRepairs } from './blocked-menu-maintenance.js';

const mocks = vi.hoisted(() => ({
  add: vi.fn(), menu: vi.fn(), getScenarios: vi.fn(), enroll: vi.fn(), fireEvent: vi.fn(),
}));
vi.mock('@line-crm/db', () => ({
  addTagToFriend: mocks.add,
  getScenarios: mocks.getScenarios,
  enrollFriendInScenario: mocks.enroll,
  toJstString: (date: Date) => new Date(date.getTime() + 9 * 60 * 60_000).toISOString().slice(0, -1) + '+09:00',
}));
vi.mock('./event-bus.js', () => ({ fireEvent: mocks.fireEvent }));
vi.mock('./rich-menu-assignment.js', () => ({ applyBlockedRichMenuForFriend: mocks.menu }));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;
let order: string[];
let failPause: boolean;
let failCancel: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  order = []; failPause = false; failCancel = false;
  sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE friends(id TEXT PRIMARY KEY,line_user_id TEXT,line_account_id TEXT,is_following INTEGER);
    CREATE TABLE tags(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE friend_tags(friend_id TEXT,tag_id TEXT,UNIQUE(friend_id,tag_id));
    CREATE TABLE friend_scenarios(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT,next_delivery_at TEXT,updated_at TEXT);
    CREATE TABLE friend_reminders(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT);
    CREATE TABLE scheduled_chat_messages(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT,last_error TEXT);
    CREATE TABLE event_booking_decision_notifications(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT,last_error TEXT);
    CREATE TABLE bookings(id TEXT PRIMARY KEY,friend_id TEXT);
    CREATE TABLE event_bookings(id TEXT PRIMARY KEY,friend_id TEXT);
    CREATE TABLE booking_reminders(id TEXT PRIMARY KEY,booking_id TEXT,status TEXT,last_error TEXT);
    CREATE TABLE event_booking_reminders(id TEXT PRIMARY KEY,booking_id TEXT,status TEXT,last_error TEXT);
    CREATE TABLE line_accounts(id TEXT PRIMARY KEY,is_active INTEGER,channel_access_token TEXT);
    CREATE TABLE account_settings(id TEXT PRIMARY KEY,line_account_id TEXT,key TEXT,value TEXT,created_at TEXT,updated_at TEXT,UNIQUE(line_account_id,key));
    CREATE TABLE rich_menu_assignments(friend_id TEXT PRIMARY KEY,line_account_id TEXT,desired_rich_menu_id TEXT,status TEXT,updated_at TEXT);
    INSERT INTO friends VALUES('friend','U-friend','acc',1),('other','U-other','other-acc',1);
    INSERT INTO tags VALUES('block','ブロック'),('normal','資料請求');
    INSERT INTO friend_scenarios VALUES('scenario','friend','active','future',NULL),('other','other','active','future',NULL),('history','friend','completed',NULL,'old');
    INSERT INTO friend_reminders VALUES('legacy','friend','active');
    INSERT INTO scheduled_chat_messages VALUES('queue','friend','pending',NULL),('other','other','pending',NULL),('sent','friend','sent',NULL);
    INSERT INTO event_booking_decision_notifications VALUES('decision','friend','pending',NULL);
    INSERT INTO bookings VALUES('booking','friend');
    INSERT INTO event_bookings VALUES('event','friend');
    INSERT INTO booking_reminders VALUES('booking-notice','booking','pending',NULL);
    INSERT INTO event_booking_reminders VALUES('event-notice','event','pending',NULL);
    INSERT INTO line_accounts VALUES('acc',1,'synthetic-token');
    INSERT INTO account_settings VALUES('config','acc','blocked_dedicated_rich_menu_id','menu-blank',NULL,NULL);
  `);
  db = {
    prepare(query: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async all() { return { results: sql.prepare(query).all(...args as never[]) }; },
        async first() { return sql.prepare(query).get(...args as never[]) ?? null; },
        async run() {
          if (query.includes('UPDATE friend_scenarios')) {
            order.push('pause');
            if (failPause) throw new Error('synthetic pause failure');
          }
          return { meta: { changes: Number(sql.prepare(query).run(...args as never[]).changes) } };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      order.push('cancel');
      if (failCancel) throw new Error('synthetic cancel failure');
      return Promise.all(statements.map(statement => statement.run()));
    },
  } as unknown as D1Database;
  mocks.add.mockImplementation(async (_db, friendId: string, tagId: string) => {
    order.push('attach');
    sql.prepare('INSERT OR IGNORE INTO friend_tags(friend_id,tag_id) VALUES(?,?)').run(friendId, tagId);
  });
  mocks.menu.mockImplementation(async () => { order.push('menu'); });
});
afterEach(() => sql.close());

function hasBlockTag() {
  return Boolean(sql.prepare(`SELECT 1 FROM friend_tags WHERE friend_id='friend' AND tag_id='block'`).get());
}
function expectStopped() {
  expect(sql.prepare(`SELECT status,next_delivery_at FROM friend_scenarios WHERE id='scenario'`).get())
    .toEqual({ status: 'paused', next_delivery_at: null });
  for (const table of ['friend_reminders', 'scheduled_chat_messages', 'event_booking_decision_notifications', 'booking_reminders', 'event_booking_reminders']) {
    const id = table === 'friend_reminders' ? 'legacy' : table === 'scheduled_chat_messages' ? 'queue' : table === 'event_booking_decision_notifications' ? 'decision' : table === 'booking_reminders' ? 'booking-notice' : 'event-notice';
    expect(sql.prepare(`SELECT status FROM ${table} WHERE id=?`).get(id)?.status).toBe('cancelled');
  }
  expect(sql.prepare(`SELECT status FROM friend_scenarios WHERE id='history'`).get()?.status).toBe('completed');
  expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='sent'`).get()?.status).toBe('sent');
  expect(sql.prepare(`SELECT status FROM friend_scenarios WHERE id='other'`).get()?.status).toBe('active');
  expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='other'`).get()?.status).toBe('pending');
  expect(sql.prepare(`SELECT is_following FROM friends WHERE id='friend'`).get()?.is_following).toBe(1);
}

describe('raw tag attachment with mandatory block enforcement', () => {
  it('preserves ordinary raw tag semantics without starting automation or enrolling a scenario', async () => {
    await expect(addTagWithBlockEnforcement(db, 'friend', 'normal')).resolves.toBe(false);
    expect(order).toEqual(['attach']);
    expect(mocks.add).toHaveBeenCalledWith(db, 'friend', 'normal');
    expect(sql.prepare(`SELECT tag_id FROM friend_tags WHERE friend_id='friend'`).get()?.tag_id).toBe('normal');
    expect(sql.prepare(`SELECT status FROM friend_scenarios WHERE id='scenario'`).get()?.status).toBe('active');
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='queue'`).get()?.status).toBe('pending');
    expect(mocks.menu).not.toHaveBeenCalled();
    expect(mocks.getScenarios).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.fireEvent).not.toHaveBeenCalled();
  });

  it('saves the real block tag, then pauses, cancels and blanks the menu in that order', async () => {
    mocks.menu.mockImplementationOnce(async () => {
      order.push('menu'); expect(hasBlockTag()).toBe(true); expectStopped();
    });
    await expect(addTagWithBlockEnforcement(db, 'friend', 'block')).resolves.toBe(true);
    expect(order).toEqual(['attach', 'pause', 'cancel', 'menu']);
    expect(mocks.menu).toHaveBeenCalledWith(db, 'friend');
    expectStopped();
    expect(mocks.fireEvent).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it.each(['pause', 'cancel'] as const)('does not report success or continue after a %s failure', async stage => {
    failPause = stage === 'pause'; failCancel = stage === 'cancel';
    await expect(addTagWithBlockEnforcement(db, 'friend', 'block')).rejects.toThrow(`synthetic ${stage} failure`);
    expect(hasBlockTag()).toBe(true);
    expect(order).toEqual(stage === 'pause' ? ['attach', 'pause'] : ['attach', 'pause', 'cancel']);
    expect(mocks.menu).not.toHaveBeenCalled();
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='queue'`).get()?.status).toBe('pending');
  });

  it('retains the saved block after a menu failure and lets durable maintenance recover it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.menu.mockRejectedValueOnce(new Error('private upstream detail'));
    try {
      await expect(addTagWithBlockEnforcement(db, 'friend', 'block')).resolves.toBe(true);
      expect(hasBlockTag()).toBe(true); expectStopped();
      expect(sql.prepare('SELECT COUNT(*) AS n FROM rich_menu_assignments').get()?.n).toBe(0);
      expect(log).toHaveBeenCalledWith('[block-tag] dedicated menu deferred to durable maintenance');
      expect(JSON.stringify(log.mock.calls)).not.toContain('private upstream detail');
      expect(await processBlockedFriendMenuRepairs(db, { now: new Date('2026-10-15T03:00:00Z') }))
        .toEqual({ attempted: 1, repaired: 1, failed: 0, skipped: 0 });
      expect(mocks.menu).toHaveBeenCalledTimes(2);
      expect(mocks.menu).toHaveBeenLastCalledWith(db, 'friend', undefined, 'acc');
    } finally { log.mockRestore(); }
  });

  it('enforces duplicate block attachments even when INSERT OR IGNORE makes no new tag link', async () => {
    await addTagWithBlockEnforcement(db, 'friend', 'block');
    await expect(addTagWithBlockEnforcement(db, 'friend', 'block')).resolves.toBe(true);
    expect(sql.prepare(`SELECT COUNT(*) AS n FROM friend_tags WHERE friend_id='friend' AND tag_id='block'`).get()?.n).toBe(1);
    expect(order).toEqual(['attach', 'pause', 'cancel', 'menu', 'attach', 'pause', 'cancel', 'menu']);
    expect(mocks.menu).toHaveBeenCalledTimes(2); expectStopped();
  });

  it('also enforces an already blocked friend when a separate ordinary tag is saved', async () => {
    sql.prepare('INSERT INTO friend_tags VALUES(?,?)').run('friend', 'block');
    await expect(addTagWithBlockEnforcement(db, 'friend', 'normal')).resolves.toBe(true);
    expect(order).toEqual(['attach', 'pause', 'cancel', 'menu']); expectStopped();
  });
});
