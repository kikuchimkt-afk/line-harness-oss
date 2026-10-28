import { createRequire } from 'node:module';
import type { DatabaseSync as SQLiteDatabase } from 'node:sqlite';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollFriendInScenario, getFriendScenariosDueForDelivery } from './scenarios.js';

describe('explicit restart preserves history and resets the schedule', () => {
 let sql: SQLiteDatabase;
 let db: D1Database;
 beforeEach(() => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
  sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE scenarios(id TEXT PRIMARY KEY,delivery_mode TEXT,is_active INTEGER,expires_at TEXT);
   CREATE TABLE scenario_steps(id TEXT,scenario_id TEXT,step_order INTEGER,delay_minutes INTEGER,offset_days INTEGER,offset_minutes INTEGER,delivery_time TEXT);
   CREATE TABLE friend_scenarios(id TEXT PRIMARY KEY,friend_id TEXT,scenario_id TEXT,current_step_order INTEGER,status TEXT,started_at TEXT,next_delivery_at TEXT,updated_at TEXT);
   CREATE UNIQUE INDEX active_run ON friend_scenarios(friend_id,scenario_id) WHERE status!='completed';
   INSERT INTO scenarios VALUES('winter','absolute_time',1,'2027-02-01T00:00:00+09:00');
   INSERT INTO scenario_steps VALUES('first','winter',1,0,0,NULL,'00:00');
   INSERT INTO friend_scenarios VALUES('old','friend-a','winter',2,'active','2026-10-20T19:00:00+09:00','2026-10-27T18:30:00+09:00','2026-10-20T19:00:00+09:00');
   INSERT INTO friend_scenarios VALUES('other','friend-b','winter',2,'active','2026-10-20T19:00:00+09:00','2026-10-27T18:30:00+09:00','2026-10-20T19:00:00+09:00');`);
  function prepare(query: string) {
   let values: unknown[]=[];
   const stmt={bind(...v: unknown[]){values=v;return stmt;},
    async first(){return sql.prepare(query).get(...values as never[])??null;},
    async all(){return {results:sql.prepare(query).all(...values as never[])};},
    async run(){const result=sql.prepare(query).run(...values as never[]);return {success:true,meta:{changes:Number(result.changes)}};}};
   return stmt;
  }
  db={prepare,async batch(statements: ReturnType<typeof prepare>[]){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 });
 afterEach(()=>{sql.close();vi.useRealTimers();});
 it('ignores duplicate ordinary enrollment',async()=>{
  expect(await enrollFriendInScenario(db,'friend-a','winter')).toBeNull();
  expect(sql.prepare('SELECT COUNT(*) n FROM friend_scenarios').get()?.n).toBe(2);
 });
 it.each(['active','paused','completed'])('restarts a %s run without affecting another friend',async status=>{
  sql.prepare('UPDATE friend_scenarios SET status=? WHERE id=?').run(status,'old');
  const fresh=await enrollFriendInScenario(db,'friend-a','winter',{restart:true});
  expect(fresh?.status).toBe('active');expect(fresh?.current_step_order).toBe(-1);
  expect(fresh?.started_at).toContain('2026-10-24T19:00:00');
  expect(fresh?.next_delivery_at).toContain('2026-10-24T19:00:00');
  expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id=?').get('old')?.status).toBe('completed');
  expect(sql.prepare('SELECT status FROM friend_scenarios WHERE id=?').get('other')?.status).toBe('active');
  expect(sql.prepare("SELECT COUNT(*) n FROM friend_scenarios WHERE friend_id='friend-a' AND status='active'").get()?.n).toBe(1);
 });
 it('does not start or deliver after the exact end boundary',async()=>{
  vi.setSystemTime(new Date('2027-01-31T15:00:00Z'));
  expect(await enrollFriendInScenario(db,'friend-a','winter',{restart:true})).toBeNull();
  expect(await getFriendScenariosDueForDelivery(db,'2027-02-01T00:00:00+09:00')).toEqual([]);
 });
 it('still delivers before the end boundary',async()=>{
  expect((await getFriendScenariosDueForDelivery(db,'2027-01-31T23:59:59+09:00')).length).toBe(2);
 });
});
