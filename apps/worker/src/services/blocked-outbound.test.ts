import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cancelBlockedFriendOutboundWork, filterUnblockedRecipients } from './blocked-outbound.js';
import { sendBookingNotification } from './booking-notifier.js';
import { sendEventBookingNotification } from './event-booking-notifier.js';
import { processDueReminders } from './booking-reminders.js';
import { processDueEventReminders } from './event-booking-reminders.js';
import { processDueEventBookingDecisionNotifications } from './event-booking-decision-notifications.js';
import { processDueScheduledChatMessages, enqueueScheduledChatMessage } from './scheduled-chat-messages.js';
import { processStepDeliveries } from './step-delivery.js';
import { applyBlockedRichMenuForFriend, applyDesiredRichMenu, restoreRichMenuAfterUnblock, processDueRichMenuAssignments, reconcileRichMenuAssignments } from './rich-menu-assignment.js';
import { linkRichMenuBulkChunked } from '../lib/rich-menu-publisher.js';
const sdk = vi.hoisted(() => ({ push: vi.fn(), link: vi.fn(), unlink: vi.fn(), get: vi.fn() }));
vi.mock('@line-crm/line-sdk', () => ({ LineClient: class { pushMessage=sdk.push; linkRichMenuToUser=sdk.link; unlinkRichMenuFromUser=sdk.unlink; getRichMenuIdOfUser=sdk.get; } }));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;
let dueRows: Record<string, unknown>[];
let beforeBatch: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  sdk.push.mockResolvedValue(undefined); sdk.link.mockResolvedValue(undefined); sdk.unlink.mockResolvedValue(undefined); sdk.get.mockResolvedValue({richMenuId:'menu-old'});
  dueRows=[];
  beforeBatch=undefined;
  sql=new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE friends(id TEXT PRIMARY KEY,line_user_id TEXT,line_account_id TEXT,is_following INTEGER,user_id TEXT,display_name TEXT,metadata TEXT);
    CREATE TABLE tags(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE friend_tags(friend_id TEXT,tag_id TEXT);
    CREATE TABLE line_accounts(id TEXT PRIMARY KEY,channel_access_token TEXT);
    CREATE TABLE automations(id TEXT PRIMARY KEY);
    CREATE TABLE account_settings(id TEXT PRIMARY KEY,line_account_id TEXT,key TEXT,value TEXT,created_at TEXT,updated_at TEXT,UNIQUE(line_account_id,key));
    CREATE TABLE scenarios(id TEXT PRIMARY KEY,is_active INTEGER);
    CREATE TABLE friend_scenarios(id TEXT PRIMARY KEY,friend_id TEXT,scenario_id TEXT,status TEXT,current_step_order INTEGER,next_delivery_at TEXT,started_at TEXT,updated_at TEXT);
    CREATE TABLE friend_reminders(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT);
    CREATE TABLE scheduled_chat_messages(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT,last_error TEXT,retry_count INTEGER,sent_at TEXT);
    CREATE TABLE event_booking_decision_notifications(id TEXT PRIMARY KEY,friend_id TEXT,status TEXT,last_error TEXT,retry_count INTEGER,sent_at TEXT);
    CREATE TABLE bookings(id TEXT PRIMARY KEY,friend_id TEXT);
    CREATE TABLE event_bookings(id TEXT PRIMARY KEY,friend_id TEXT);
    CREATE TABLE booking_reminders(id TEXT PRIMARY KEY,booking_id TEXT,status TEXT,last_error TEXT,retry_count INTEGER,sent_at TEXT);
    CREATE TABLE event_booking_reminders(id TEXT PRIMARY KEY,booking_id TEXT,status TEXT,last_error TEXT,retry_count INTEGER,sent_at TEXT);
    CREATE TABLE messages_log(id TEXT PRIMARY KEY,friend_id TEXT,direction TEXT,message_type TEXT,content TEXT,source TEXT,line_account_id TEXT,created_at TEXT);
    INSERT INTO friends VALUES('blocked','U-block','acc',1,NULL,'架空の生徒','{}'),('allowed','U-ok','acc',1,NULL,'架空の保護者','{}');
    INSERT INTO line_accounts VALUES('acc','synthetic-token'); INSERT INTO tags VALUES('b','ブロック'); INSERT INTO friend_tags VALUES('blocked','b');
    INSERT INTO account_settings VALUES('cfg','acc','blocked_dedicated_rich_menu_id','menu-blank',NULL,NULL);
    INSERT INTO friend_reminders VALUES('legacy','blocked','active');
    INSERT INTO scheduled_chat_messages VALUES('q','blocked','pending',NULL,0,NULL);
    INSERT INTO event_booking_decision_notifications VALUES('q','blocked','pending',NULL,0,NULL);
    INSERT INTO bookings VALUES('booking','blocked'); INSERT INTO event_bookings VALUES('event-booking','blocked');
    INSERT INTO booking_reminders VALUES('q','booking','pending',NULL,0,NULL);
    INSERT INTO event_booking_reminders VALUES('q','event-booking','pending',NULL,0,NULL);
    INSERT INTO scenarios VALUES('sc',1); INSERT INTO friend_scenarios VALUES('fs','blocked','sc','active',-1,'2000-01-01T00:00:00Z','2000-01-01T00:00:00Z',NULL);
  `);
  sql.exec(readFileSync(new URL('../../../../packages/db/migrations/056_rich_menu_assignments.sql',import.meta.url),'utf8'));
  db={prepare(query:string){let args:unknown[]=[]; const s={bind(...a:unknown[]){args=a;return s;},
    async all(){if (['FROM scheduled_chat_messages q','FROM booking_reminders r','FROM event_booking_reminders r','FROM event_booking_decision_notifications n'].some(m=>query.includes(m))) return {results:dueRows};return {results:sql.prepare(query).all(...args as never[])};},
    async first(){return sql.prepare(query).get(...args as never[])??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args as never[]).changes)}};}};return s;},
    async batch(statements:Array<{run:()=>Promise<unknown>}>){beforeBatch?.();return Promise.all(statements.map(s=>s.run()));}
  } as unknown as D1Database;
});
afterEach(()=>sql.close());

describe('authoritative block policy at outbound boundaries',()=>{
  it('filters real friend-tag links without inferring metadata, retaining order',async()=>{
    expect(await filterUnblockedRecipients(db,[{id:'allowed'},{id:'blocked'}])).toEqual([{id:'allowed'}]);
  });
  it('cancels all pending queues while leaving sent history intact and never resumes on tag removal',async()=>{
    sql.exec(`INSERT INTO scheduled_chat_messages VALUES('sent','blocked','sent',NULL,1,'2026-10-01');`);
    await cancelBlockedFriendOutboundWork(db,'blocked','acc');
    for(const table of ['scheduled_chat_messages','event_booking_decision_notifications','booking_reminders','event_booking_reminders']) {
      expect(sql.prepare(`SELECT status,last_error FROM ${table} WHERE id='q'`).get()).toMatchObject({status:'cancelled',last_error:expect.stringContaining('FRIEND_BLOCKED')});
    }
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='sent'`).get()?.status).toBe('sent');
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='blocked'`);
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='q'`).get()?.status).toBe('cancelled');
  });
  it('does not cancel another account when explicitly scoped',async()=>{
    await cancelBlockedFriendOutboundWork(db,'blocked','different-account');
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='q'`).get()?.status).toBe('pending');
  });
  it.each(['remove','rename','move-account'] as const)('does not cancel newly created queues after %s between policy snapshot and batch',async change=>{
    beforeBatch=()=>{
      beforeBatch=undefined;
      if(change==='remove')sql.exec(`DELETE FROM friend_tags WHERE friend_id='blocked'`);
      else if(change==='rename')sql.exec(`UPDATE tags SET name='資料請求' WHERE id='b'`);
      else sql.exec(`UPDATE friends SET line_account_id='different-account' WHERE id='blocked'`);
      sql.exec(`INSERT INTO friend_reminders VALUES('new','blocked','active');
        INSERT INTO scheduled_chat_messages VALUES('new','blocked','pending',NULL,0,NULL);
        INSERT INTO event_booking_decision_notifications VALUES('new','blocked','pending',NULL,0,NULL);
        INSERT INTO booking_reminders VALUES('new','booking','pending',NULL,0,NULL);
        INSERT INTO event_booking_reminders VALUES('new','event-booking','pending',NULL,0,NULL);`);
    };
    await cancelBlockedFriendOutboundWork(db,'blocked','acc');
    for(const table of ['scheduled_chat_messages','event_booking_decision_notifications','booking_reminders','event_booking_reminders']){
      for(const id of ['q','new'])expect(sql.prepare(`SELECT status,last_error FROM ${table} WHERE id=?`).get(id)).toEqual({status:'pending',last_error:null});
    }
    expect(sql.prepare(`SELECT status FROM friend_reminders WHERE id='legacy'`).get()?.status).toBe('active');
    expect(sql.prepare(`SELECT status FROM friend_reminders WHERE id='new'`).get()?.status).toBe('active');
    expect(sdk.push).not.toHaveBeenCalled();
  });
  it('does not cancel work when the target no longer has a block tag',async()=>{
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='blocked'`);
    await cancelBlockedFriendOutboundWork(db,'blocked','acc');
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='q'`).get()?.status).toBe('pending');
    expect(sql.prepare(`SELECT status FROM friend_reminders WHERE id='legacy'`).get()?.status).toBe('active');
  });
  it('cancels normalized block-tag queues without touching an unblocked customer or sent history',async()=>{
    sql.exec(`UPDATE tags SET name=' ﾌﾞﾛｯｸ　' WHERE id='b';
      INSERT INTO scheduled_chat_messages VALUES('allowed-q','allowed','pending',NULL,0,NULL);
      INSERT INTO scheduled_chat_messages VALUES('sent','blocked','sent',NULL,1,'2026-10-01');`);
    await cancelBlockedFriendOutboundWork(db,'blocked','acc');
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='q'`).get()?.status).toBe('cancelled');
    expect(sql.prepare(`SELECT status FROM scheduled_chat_messages WHERE id='allowed-q'`).get()?.status).toBe('pending');
    expect(sql.prepare(`SELECT status,sent_at FROM scheduled_chat_messages WHERE id='sent'`).get()).toEqual({status:'sent',sent_at:'2026-10-01'});
    expect(sql.prepare(`SELECT is_following FROM friends WHERE id='blocked'`).get()?.is_following).toBe(1);
  });
  it('pauses a due scenario without a LINE push, progress advance or message log',async()=>{
    await processStepDeliveries(db,{pushMessage:sdk.push} as never);
    expect(sql.prepare(`SELECT status,next_delivery_at,current_step_order FROM friend_scenarios WHERE id='fs'`).get()).toMatchObject({status:'paused',next_delivery_at:null,current_step_order:-1});
    expect(sdk.push).not.toHaveBeenCalled(); expect(sql.prepare('SELECT COUNT(*) n FROM messages_log').get()?.n).toBe(0);
  });
  it.each(['booking','event'])('rejects %s direct notice without push or fake outgoing log',async kind=>{
    const common={channelAccessToken:'synthetic-token',toLineUserId:'U-block',db,friendId:'blocked',lineAccountId:'acc'};
    const job=kind==='booking'?sendBookingNotification({...common,kind:'approved',ctx:{menuName:'学習相談',staffName:'講師',startsAtJst:'2099-01-01 15:00',hoursBefore:0}}):sendEventBookingNotification({...common,kind:'confirmed',ctx:{eventName:'勉強会',startsAtJst:'2099-01-01 15:00'}});
    await expect(job).rejects.toMatchObject({code:'FRIEND_BLOCKED'});expect(sdk.push).not.toHaveBeenCalled();expect(sql.prepare('SELECT COUNT(*) n FROM messages_log').get()?.n).toBe(0);
  });
  it.each(['booking','event','decision','chat'])('skips %s queue, cancels it, and never calls sender or writes sent_at',async kind=>{
    dueRows=[{id:'q',friend_id:'blocked',line_user_id:'U-block',line_account_id:'acc',retry_count:0,kind:'confirmed',channel_access_token:'synthetic-token',message_type:'text',content:'案内',context_json:'{}'}];
    const sender=vi.fn(); const now=new Date('2099-01-01T00:00:00Z');
    const result=kind==='booking'?await processDueReminders(db,{now,sender,reminderHoursBefore:2}):kind==='event'?await processDueEventReminders(db,{now,sender}):kind==='decision'?await processDueEventBookingDecisionNotifications(db,{now,sender}):await processDueScheduledChatMessages(db,{now,defaultChannelAccessToken:'synthetic-token'});
    expect(result).toMatchObject({sent:0,failed:0,skipped:1});expect(sender).not.toHaveBeenCalled();expect(sdk.push).not.toHaveBeenCalled();
    const table=kind==='booking'?'booking_reminders':kind==='event'?'event_booking_reminders':kind==='decision'?'event_booking_decision_notifications':'scheduled_chat_messages';
    expect(sql.prepare(`SELECT status,sent_at,retry_count FROM ${table} WHERE id='q'`).get()).toMatchObject({status:'cancelled',sent_at:null,retry_count:0});
  });
  it('rejects enqueueing manual scheduled messages for a blocked friend',async()=>{
    await expect(enqueueScheduledChatMessage(db,{chatId:'c',friendId:'blocked',messageType:'text',content:'案内',scheduledAt:'2099-01-01'})).rejects.toMatchObject({code:'FRIEND_BLOCKED'});
  });
  it('allows a normal notice and real outgoing history for an unblocked friend',async()=>{
    await sendBookingNotification({channelAccessToken:'synthetic-token',toLineUserId:'U-ok',db,friendId:'allowed',lineAccountId:'acc',kind:'approved',ctx:{menuName:'学習相談',staffName:'講師',startsAtJst:'2099-01-01 15:00',hoursBefore:0}});
    expect(sdk.push).toHaveBeenCalledTimes(1);expect(sql.prepare('SELECT COUNT(*) n FROM messages_log').get()?.n).toBe(1);
  });
  it('does not persist or link a normal menu to a blocked friend',async()=>{
    await expect(applyDesiredRichMenu(db,{friendId:'blocked',richMenuId:'menu-normal',lineAccessToken:'synthetic-token'})).rejects.toMatchObject({code:'FRIEND_BLOCKED'});
    expect(sdk.link).not.toHaveBeenCalled();expect(sql.prepare('SELECT COUNT(*) n FROM rich_menu_assignments').get()?.n).toBe(0);
  });
  it('backs up the prior menu, applies only the dedicated blank menu and restores after unblock',async()=>{
    await applyBlockedRichMenuForFriend(db,'blocked','synthetic-token','acc');
    expect(sdk.link).toHaveBeenLastCalledWith('U-block','menu-blank');
    const backup=sql.prepare(`SELECT value FROM account_settings WHERE key='blocked_previous_rich_menu_id:blocked'`).get()?.value;
    expect(JSON.parse(String(backup))).toEqual({richMenuId:'menu-old'});
    await expect(restoreRichMenuAfterUnblock(db,'blocked','synthetic-token','acc')).rejects.toMatchObject({code:'FRIEND_BLOCKED'});
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='blocked'`);
    await restoreRichMenuAfterUnblock(db,'blocked','synthetic-token','acc');
    expect(sdk.link).toHaveBeenLastCalledWith('U-block','menu-old');expect(sql.prepare(`SELECT value FROM account_settings WHERE key='blocked_previous_rich_menu_id:blocked'`).get()).toBeUndefined();
  });
  it('cron retry refuses a stale normal menu for blocked users',async()=>{
    sql.exec(`INSERT INTO rich_menu_assignments(friend_id,line_account_id,desired_rich_menu_id,status,created_at,updated_at) VALUES('blocked','acc','menu-normal','pending','2000','2000');`);
    const result=await processDueRichMenuAssignments(db,{now:new Date('2099-01-01')});
    expect(result.failedPermanent).toBe(1);expect(sdk.link).not.toHaveBeenCalled();
  });
  it('late normal LINE completion after a block is immediately repaired to the blank menu',async()=>{
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='blocked'`);
    sdk.link.mockImplementationOnce(async()=>{sql.exec(`INSERT INTO friend_tags VALUES('blocked','b')`);});
    await applyDesiredRichMenu(db,{friendId:'blocked',richMenuId:'menu-normal',lineAccessToken:'synthetic-token',lineAccountId:'acc'});
    expect(sdk.link).toHaveBeenLastCalledWith('U-block','menu-blank');
    expect(sql.prepare('SELECT desired_rich_menu_id,status FROM rich_menu_assignments').get()).toMatchObject({desired_rich_menu_id:'menu-blank',status:'applied'});
  });
  it('restores an unchanged account default when no prior individual menu existed',async()=>{
    sdk.get.mockRejectedValueOnce(new Error('LINE API error: 404 Not found'));
    await applyBlockedRichMenuForFriend(db,'blocked','synthetic-token','acc');
    sql.exec(`DELETE FROM friend_tags WHERE friend_id='blocked'`);
    await restoreRichMenuAfterUnblock(db,'blocked','synthetic-token','acc');
    expect(sdk.unlink).toHaveBeenCalledWith('U-block');expect(sql.prepare('SELECT desired_rich_menu_id,status FROM rich_menu_assignments').get()).toEqual({desired_rich_menu_id:'__lineharness_account_default__',status:'applied'});
  });
  it('reconciliation never restores a blocked normal menu',async()=>{
    sql.exec(`INSERT INTO rich_menu_assignments(friend_id,line_account_id,desired_rich_menu_id,status,created_at,updated_at) VALUES('blocked','acc','menu-normal','applied','2000','2000');`);
    const result=await reconcileRichMenuAssignments(db,{now:new Date('2099-01-01')});
    expect(result.unavailable).toBe(1);expect(sdk.get).not.toHaveBeenCalled();expect(sql.prepare('SELECT status FROM rich_menu_assignments').get()?.status).toBe('failed_permanent');
  });
  it('bulk helper excludes blocked recipients and counts only actual linked recipients',async()=>{
    const link=vi.fn();
    const result=await linkRichMenuBulkChunked({linkRichMenuBulk:link} as never,'menu-normal',['U-block','U-ok'],{db,accountId:'acc'});
    expect(result).toEqual({chunks:1,total:1});expect(link).toHaveBeenCalledWith('menu-normal',['U-ok']);
  });
  it('bulk helper refuses unscoped calls instead of silently bypassing block checks',async()=>{
    const link=vi.fn();await expect(linkRichMenuBulkChunked({linkRichMenuBulk:link} as never,'menu-normal',['U-block'],undefined as never)).rejects.toThrow('Account-scoped');expect(link).not.toHaveBeenCalled();
  });
});
