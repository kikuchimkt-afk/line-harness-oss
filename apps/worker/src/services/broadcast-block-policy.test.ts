import { beforeEach, describe, expect, it, vi } from 'vitest';
const api=vi.hoisted(()=>({getBroadcastById:vi.fn(),getQueuedBroadcasts:vi.fn(),updateBroadcastStatus:vi.fn(),updateBroadcastLineRequestId:vi.fn(),createBroadcastInsight:vi.fn(),getLineAccountById:vi.fn(),getFriendsByTag:vi.fn(),updateBroadcastBatchProgress:vi.fn()}));
vi.mock('@line-crm/db',async(importOriginal)=>({...await importOriginal<object>(),...api}));
vi.mock('./stealth.js',()=>({calculateStaggerDelay:()=>0,sleep:async()=>{},addMessageVariation:(text:string)=>text}));
import { processBroadcastSend,processQueuedBroadcasts } from './broadcast.js';
import { processSegmentSend } from './segment-send.js';

let rows:Array<{id:string;line_user_id:string}>;
let executed:Array<{sql:string;args:unknown[]}>;
let blockIds:Set<string>;
const makeDb=():D1Database=>({prepare(sql:string){let args:unknown[]=[];const s={bind(...a:unknown[]){args=a;return s;},async first(){return null;},async all(){
  if(sql.includes('JOIN friend_tags ft')&&sql.includes('SELECT f.id AS identity'))return{results:rows.filter(r=>args.includes(r.id)&&blockIds.has(r.id)).map(r=>({identity:r.id,name:'ブロック'}))};
  if(sql.includes('FROM friends')) return{results:rows};return{results:[]};},async run(){executed.push({sql,args});return{meta:{changes:1}};}};return s;},async batch(s:Array<{run:()=>Promise<unknown>}>){return Promise.all(s.map(x=>x.run()));}} as unknown as D1Database);
const config=(target_type='all')=>({id:'bcast-12345',target_type,target_tag_id:null,line_account_id:'acc',message_type:'text',message_content:'学習案内',status:'queued',batch_offset:0,segment_conditions:null,target_friend_ids:'["blocked","allowed"]'});
beforeEach(()=>{
  vi.clearAllMocks();executed=[];rows=[{id:'blocked',line_user_id:'U-block'},{id:'allowed',line_user_id:'U-ok'}];blockIds=new Set(['blocked']);
  api.getBroadcastById.mockResolvedValue(config());api.getLineAccountById.mockResolvedValue(null);api.getFriendsByTag.mockResolvedValue(rows.map(r=>({...r,is_following:1})));api.getQueuedBroadcasts.mockResolvedValue([config()]);
});
describe('broadcast application-block policy',()=>{
  it.each(['all','friends','tag'])('%s normal send excludes blocked IDs and logs only successful recipients',async kind=>{
    api.getBroadcastById.mockResolvedValue({...config(kind),target_tag_id:kind==='tag'?'t':null});
    const multicast=vi.fn();await processBroadcastSend(makeDb(),{multicast} as never,'bcast-12345');
    expect(multicast).toHaveBeenCalledWith(['U-ok'],expect.any(Array),expect.any(Array));
    expect(executed.filter(s=>s.sql.includes('INSERT INTO messages_log')).map(s=>s.args[1])).toEqual(['allowed']);
    expect(api.updateBroadcastStatus).toHaveBeenCalledWith(expect.anything(),'bcast-12345','sent',{totalCount:1,successCount:1});
  });
  it('segment send excludes blocked IDs before sending and logging',async()=>{
    const multicast=vi.fn();await processSegmentSend(makeDb(),{multicast} as never,'bcast-12345',{rules:[]} as never);
    expect(multicast).toHaveBeenCalledWith(['U-ok'],expect.any(Array),expect.any(Array));
    expect(executed.filter(s=>s.sql.includes('INSERT INTO messages_log')).map(s=>s.args[1])).toEqual(['allowed']);
  });
  it('queued all falls back to filtered multicast, never LINE broadcast, and counts actual successes',async()=>{
    const multicast=vi.fn(),broadcast=vi.fn();await processQueuedBroadcasts(makeDb(),{multicast,broadcast} as never);
    expect(multicast).toHaveBeenCalledWith(['U-ok'],expect.any(Array),expect.any(Array));expect(broadcast).not.toHaveBeenCalled();
    expect(executed.find(s=>s.sql.includes('success_count = success_count +'))?.args[0]).toBe(1);
    expect(executed.filter(s=>s.sql.includes('INSERT INTO messages_log')).map(s=>s.args[1])).toEqual(['allowed']);
  });
  it('queued all-blocked batch advances without network calls or fake logs/counts',async()=>{
    blockIds.add('allowed');const multicast=vi.fn(),broadcast=vi.fn();await processQueuedBroadcasts(makeDb(),{multicast,broadcast} as never);
    expect(multicast).not.toHaveBeenCalled();expect(broadcast).not.toHaveBeenCalled();expect(executed.filter(s=>s.sql.includes('INSERT INTO messages_log'))).toEqual([]);
    expect(executed.filter(s=>s.sql.includes('success_count = success_count +'))).toEqual([]);
  });
});
