import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { BLOCKED_MENU_SPEC,BLOCKED_MENU_SETTING,BLOCKED_MENU_SETUP_STATE,blockedMenuImage,ensureBlockedMenuForAccount,processDueBlockedMenuSetups } from './blocked-menu-setup.js';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const id = (letter: string) => 'richmenu-' + letter.repeat(32);
const now = new Date('2026-10-15T01:00:00Z');
type Menu = typeof BLOCKED_MENU_SPEC & { richMenuId: string };
type Bot = { menus: Map<string,Menu>; images: Map<string,Uint8Array>; defaultId: string; createdId: string };
let sql: import('node:sqlite').DatabaseSync;
let db: D1Database;
let bots: Map<string,Bot>;
let requests: Array<{ token: string; method: string; path: string; body?: unknown }>;
let beforeRequest: ((request: typeof requests[number]) => Promise<Response | undefined> | Response | undefined) | undefined;
const menu = (richMenuId: string): Menu => ({ ...BLOCKED_MENU_SPEC, size:{...BLOCKED_MENU_SPEC.size},areas:[],richMenuId });
const json = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function put(account: string,key: string,value: string) {
  sql.prepare('INSERT INTO account_settings(id,line_account_id,key,value) VALUES(?,?,?,?) ON CONFLICT(line_account_id,key) DO UPDATE SET value=excluded.value').run(crypto.randomUUID(),account,key,value);
}
const setting = (account='acc-a',key=BLOCKED_MENU_SETTING) => (sql.prepare('SELECT value FROM account_settings WHERE line_account_id=? AND key=?').get(account,key) as {value:string}|undefined)?.value;
const state = (account='acc-a') => JSON.parse(setting(account,BLOCKED_MENU_SETUP_STATE)??'null');
beforeEach(()=>{
  sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE line_accounts(id TEXT PRIMARY KEY,is_active INTEGER,channel_access_token TEXT);
    CREATE TABLE account_settings(id TEXT PRIMARY KEY,line_account_id TEXT,key TEXT,value TEXT,created_at TEXT,updated_at TEXT,UNIQUE(line_account_id,key));
    INSERT INTO line_accounts VALUES('acc-a',1,'token-a'),('acc-b',1,'token-b');`);
  db={prepare(query:string){let args:unknown[]=[];const statement={bind(...values:unknown[]){args=values;return statement;},async first(){return sql.prepare(query).get(...args as never[])??null;},async all(){return {results:sql.prepare(query).all(...args as never[])};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args as never[]).changes)}};}};return statement;},async batch(statements:Array<{run:()=>Promise<unknown>}>){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
  bots=new Map([['token-a',{menus:new Map(),images:new Map(),defaultId:id('d'),createdId:id('a')}],['token-b',{menus:new Map(),images:new Map(),defaultId:id('e'),createdId:id('b')}]]);
  requests=[];beforeRequest=undefined;
  vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
    const token=new Headers(init?.headers).get('Authorization')?.slice(7)??'';
    const request={token,method:init?.method??'GET',path:new URL(String(input)).pathname,body:init?.body};requests.push(request);
    const intercepted=await beforeRequest?.(request);if(intercepted)return intercepted;
    const bot=bots.get(token);if(!bot)return json({},401);
    if(request.path==='/v2/bot/user/all/richmenu')return json({richMenuId:bot.defaultId});
    if(request.path==='/v2/bot/richmenu/list')return json({richmenus:[...bot.menus.values()]});
    if(request.path==='/v2/bot/richmenu/validate')return json({});
    if(request.path==='/v2/bot/richmenu'&&request.method==='POST'){bot.menus.set(bot.createdId,menu(bot.createdId));return json({richMenuId:bot.createdId});}
    const parts=request.path.split('/'),resource=parts[4];
    if(parts[5]==='content'){
      if(!bot.menus.has(resource))return json({},404);
      if(request.method==='POST'){bot.images.set(resource,new Uint8Array(request.body as ArrayBuffer));return json({});}
      return bot.images.has(resource)?new Response(bot.images.get(resource) as BodyInit):json({},404);
    }
    return bot.menus.has(resource)?json(bot.menus.get(resource)):json({},404);
  }));
});
afterEach(()=>{vi.unstubAllGlobals();sql.close();});

describe('account-scoped block menu initialization',()=>{
  it('reuses the byte-identical white image already validated on all eight accounts',()=>{
    expect(createHash('sha256').update(blockedMenuImage()).digest('hex')).toBe('c75e85d6150b02c9d8851ed7b120855a0708362426bf21f8635458d0d4190122');
  });
  it('creates a neutral menu, uploads the original white PNG, and never writes defaults/users/messages',async()=>{
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'ready',richMenuId:id('a')});
    expect(setting()).toBe(id('a'));expect(state().status).toBe('ready');
    expect(bots.get('token-a')?.images.get(id('a'))).toEqual(blockedMenuImage());
    expect(bots.get('token-a')?.defaultId).toBe(id('d'));
    const writes=requests.filter(r=>r.method!=='GET');
    expect(writes.every(r=>r.path==='/v2/bot/richmenu'||r.path==='/v2/bot/richmenu/validate'||r.path.endsWith('/content'))).toBe(true);
    expect(writes.some(r=>r.path.includes('/user/')||r.path.includes('/message/'))).toBe(false);
    expect(writes.find(r=>r.path==='/v2/bot/richmenu')?.body).toBe(JSON.stringify(BLOCKED_MENU_SPEC));
  });
  it('returns a verified cached resource without additional LINE calls',async()=>{
    await ensureBlockedMenuForAccount(db,'acc-a',{now});const count=requests.length;
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).status).toBe('ready');expect(requests).toHaveLength(count);
  });
  it('keeps a concurrent initializer behind the account lease',async()=>{
    let release!:()=>void,entered!:()=>void;
    const reached=new Promise<void>(resolve=>{entered=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
    beforeRequest=async r=>{if(r.path==='/v2/bot/richmenu/list'){entered();await hold;}return undefined;};
    const first=ensureBlockedMenuForAccount(db,'acc-a',{now});await reached;
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toMatchObject({status:'pending',code:'SETUP_IN_PROGRESS'});
    release();expect((await first).status).toBe('ready');expect(requests.filter(r=>r.path==='/v2/bot/richmenu'&&r.method==='POST')).toHaveLength(1);
  });
  it('persists sanitized retry state and respects backoff on 429',async()=>{
    beforeRequest=()=>json({message:'sensitive upstream response'},429);
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'retry_wait',code:'LINE_HTTP_429'});
    expect(setting()).toBeUndefined();expect(state().nextAttemptAt).toBe(now.getTime()+300000);
    const count=requests.length;await ensureBlockedMenuForAccount(db,'acc-a',{now:new Date(now.getTime()+1000)});expect(requests).toHaveLength(count);
    expect(JSON.stringify(state())).not.toContain('sensitive');expect(JSON.stringify(state())).not.toContain('token-a');
  });
  it('reuses a created candidate after image upload fails',async()=>{
    beforeRequest=r=>r.method==='POST'&&r.path.endsWith('/content')?json({},500):undefined;
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).status).toBe('retry_wait');expect(state().candidateMenuId).toBe(id('a'));expect(setting()).toBeUndefined();
    beforeRequest=undefined;
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now:new Date(now.getTime()+300000)})).status).toBe('ready');
    expect(requests.filter(r=>r.method==='POST'&&r.path==='/v2/bot/richmenu')).toHaveLength(1);
  });
  it.each(['different-bytes','missing'] as const)('does not publish a 200 upload with %s on readback, and recovers the same candidate',async imageOutcome=>{
    beforeRequest=r=>{
      if(r.method!=='POST'||!r.path.endsWith('/content'))return undefined;
      if(imageOutcome==='different-bytes')bots.get('token-a')!.images.set(id('a'),new TextEncoder().encode('not the verified white PNG'));
      return json({});
    };
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'retry_wait',code:'IMAGE_VERIFICATION_FAILED'});
    expect(setting()).toBeUndefined();expect(state()).toMatchObject({status:'retry_wait',candidateMenuId:id('a'),nextAttemptAt:now.getTime()+300000});
    expect(bots.get('token-a')!.defaultId).toBe(id('d'));
    const firstUpload=requests.findIndex(r=>r.method==='POST'&&r.path.endsWith('/content'));
    expect(requests[firstUpload+1]).toMatchObject({token:'token-a',method:'GET',path:'/v2/bot/richmenu/'+id('a')+'/content'});
    beforeRequest=undefined;
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now:new Date(now.getTime()+300000)})).toEqual({status:'ready',richMenuId:id('a')});
    expect(bots.get('token-a')!.images.get(id('a'))).toEqual(blockedMenuImage());
    expect(requests.filter(r=>r.method==='POST'&&r.path==='/v2/bot/richmenu')).toHaveLength(1);
    expect(requests.some(r=>r.method==='POST'&&(r.path.includes('/user/')||r.path.includes('/message/')))).toBe(false);
  });
  it('retries the same uploaded candidate after a readback network error without a duplicate create or unnecessary upload',async()=>{
    let uploaded=false;
    beforeRequest=r=>{
      if(r.method==='POST'&&r.path.endsWith('/content'))uploaded=true;
      else if(uploaded&&r.method==='GET'&&r.path.endsWith('/content'))throw new Error('private transport detail');
      return undefined;
    };
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'retry_wait',code:'LINE_NETWORK_ERROR'});
    expect(setting()).toBeUndefined();expect(state().candidateMenuId).toBe(id('a'));
    expect(JSON.stringify(state())).not.toContain('private transport detail');
    beforeRequest=undefined;
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now:new Date(now.getTime()+300000)})).status).toBe('ready');
    expect(requests.filter(r=>r.method==='POST'&&r.path==='/v2/bot/richmenu')).toHaveLength(1);
    expect(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/content'))).toHaveLength(1);
  });
  it('recovers an unknown create outcome using the account resource list',async()=>{
    beforeRequest=r=>{if(r.path==='/v2/bot/richmenu'&&r.method==='POST'){bots.get('token-a')!.menus.set(id('a'),menu(id('a')));throw new Error('token-a must never appear in result');}return undefined;};
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'retry_wait',code:'LINE_NETWORK_ERROR'});
    beforeRequest=undefined;expect((await ensureBlockedMenuForAccount(db,'acc-a',{now:new Date(now.getTime()+300000)})).status).toBe('ready');
    expect(requests.filter(r=>r.path==='/v2/bot/richmenu'&&r.method==='POST')).toHaveLength(1);
  });
  it('does not reuse another account resource and does not mutate that account',async()=>{
    bots.get('token-b')!.menus.set(id('b'),menu(id('b')));put('acc-a',BLOCKED_MENU_SETTING,id('b'));
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'ready',richMenuId:id('a')});
    expect(requests.every(r=>r.token==='token-a')).toBe(true);expect(bots.get('token-b')!.images.size).toBe(0);
  });
  it('revalidates when credentials rotate despite an earlier ready cache',async()=>{
    await ensureBlockedMenuForAccount(db,'acc-a',{now});sql.prepare('UPDATE line_accounts SET channel_access_token=? WHERE id=?').run('token-b','acc-a');
    expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'ready',richMenuId:id('b')});
    expect(bots.get('token-a')!.menus.has(id('a'))).toBe(true);expect(bots.get('token-a')!.defaultId).toBe(id('d'));
  });
  it('refuses a stale token commit, then accepts the current token immediately',async()=>{
    beforeRequest=r=>{if(r.method==='GET'&&r.path==='/v2/bot/richmenu/'+id('a'))sql.prepare('UPDATE line_accounts SET channel_access_token=? WHERE id=?').run('token-b','acc-a');return undefined;};
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).code).toBe('SETUP_ACCOUNT_CHANGED');expect(setting()).toBeUndefined();
    beforeRequest=undefined;expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).richMenuId).toBe(id('b'));
  });
  it('does not overwrite a different lease owner after an in-flight response',async()=>{
    beforeRequest=r=>{if(r.method==='GET'&&r.path==='/v2/bot/richmenu/'+id('a'))put('acc-a',BLOCKED_MENU_SETUP_STATE,JSON.stringify({status:'processing',attempts:9,tokenFingerprint:'other',leaseId:'new-owner',leaseUntil:now.getTime()+999999}));return undefined;};
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).status).toBe('retry_wait');expect(setting()).toBeUndefined();expect(state().leaseId).toBe('new-owner');
  });
  it('can recover an expired processing lease',async()=>{
    await ensureBlockedMenuForAccount(db,'acc-a',{now});put('acc-a',BLOCKED_MENU_SETUP_STATE,JSON.stringify({...state(),status:'processing',leaseUntil:now.getTime()-1}));
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).status).toBe('ready');expect(requests.filter(r=>r.path==='/v2/bot/richmenu'&&r.method==='POST')).toHaveLength(1);
  });
  it('does not provision absent or inactive accounts',async()=>{
    sql.prepare('UPDATE line_accounts SET is_active=0 WHERE id=?').run('acc-a');
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).status).toBe('inactive');expect((await ensureBlockedMenuForAccount(db,'absent',{now})).status).toBe('inactive');expect(requests).toHaveLength(0);
  });
  it('records missing credentials without making any LINE request',async()=>{
    sql.prepare('UPDATE line_accounts SET channel_access_token=? WHERE id=?').run('','acc-a');expect(await ensureBlockedMenuForAccount(db,'acc-a',{now})).toEqual({status:'retry_wait',code:'TOKEN_MISSING'});expect(requests).toHaveLength(0);
  });
  it('does not overwrite a same-name menu with active areas',async()=>{
    const unsafe={...menu(id('f')),areas:[{action:{type:'uri',uri:'https://example.test'}}]};bots.get('token-a')!.menus.set(id('f'),unsafe as unknown as Menu);put('acc-a',BLOCKED_MENU_SETTING,id('f'));
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).richMenuId).toBe(id('a'));expect(bots.get('token-a')!.images.has(id('f'))).toBe(false);expect(bots.get('token-a')!.menus.get(id('f'))).toEqual(unsafe);
  });
  it('notices a manually changed configured ID even while ready cache is fresh',async()=>{
    await ensureBlockedMenuForAccount(db,'acc-a',{now});const count=requests.length;put('acc-a',BLOCKED_MENU_SETTING,id('f'));
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).richMenuId).toBe(id('a'));expect(requests.length).toBeGreaterThan(count);
  });
  it('refuses to upload if the chosen resource becomes a global default',async()=>{
    beforeRequest=r=>{if(r.method==='GET'&&r.path.endsWith('/content'))bots.get('token-a')!.defaultId=id('a');return undefined;};
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now})).code).toBe('DEFAULT_MENU_CHANGED');expect(setting()).toBeUndefined();expect(requests.some(r=>r.method==='POST'&&r.path.endsWith('/content'))).toBe(false);
  });
  it('bounds Cron setup work and does not starve the second account behind a failure',async()=>{
    beforeRequest=r=>r.token==='token-a'?json({},503):undefined;
    expect(await processDueBlockedMenuSetups(db,{now,limit:1})).toMatchObject({attempted:1,failed:1});
    expect(await processDueBlockedMenuSetups(db,{now,limit:1})).toMatchObject({attempted:1,ready:1,readyAccountIds:['acc-b']});
    expect(setting('acc-b')).toBe(id('b'));
  });
  it('rechecks a ready resource daily without creating a duplicate',async()=>{
    await ensureBlockedMenuForAccount(db,'acc-a',{now});const count=requests.length;
    expect((await ensureBlockedMenuForAccount(db,'acc-a',{now:new Date(now.getTime()+86400000)})).status).toBe('ready');expect(requests.length).toBeGreaterThan(count);
    expect(requests.filter(r=>r.method==='POST'&&r.path==='/v2/bot/richmenu')).toHaveLength(1);
  });
});
