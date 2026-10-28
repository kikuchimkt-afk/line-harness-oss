const DAY_MS=86400000;
const JST_MS=32400000;
export interface WeeklyWindow { weekday:number; start:string; end:string }
export interface WeeklySlot { id:string; startsAt:string; endsAt:string }
function minute(time:string):number {
 if(!/^\d{2}:\d{2}$/.test(time)) throw Error('Invalid time');
 const [h,m]=time.split(':').map(Number);
 if(h>23||m>59)throw Error('Invalid time');
 return h*60+m;
}
export function buildWeeklySlots(eventId:string,windows:WeeklyWindow[],now:Date,horizonDays:number):WeeklySlot[]{
 if(!Number.isInteger(horizonDays)||horizonDays<1||horizonDays>90)throw Error('Invalid horizon');
 const date=new Date(now.getTime()+JST_MS).toISOString().slice(0,10);
 const midnight=Date.parse(date+'T00:00:00Z');
 const result=new Map<string,WeeklySlot>();
 for(const w of windows){
  const start=minute(w.start),end=minute(w.end);
  if(!Number.isInteger(w.weekday)||w.weekday<0||w.weekday>6||end<=start||(end-start)%60!==0)throw Error('Invalid window');
  for(let day=0;day<horizonDays;day++){
   const local=new Date(midnight+day*DAY_MS);
   if(local.getUTCDay()!==w.weekday)continue;
   const localDate=local.toISOString().slice(0,10);
   for(let m=start;m+60<=end;m+=60){
    const time=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
    const begins=Date.parse(localDate+'T'+time+':00+09:00');
    if(begins<=now.getTime())continue;
    const id=eventId+'-'+localDate+'-'+time.replace(':','');
    result.set(id,{id,startsAt:new Date(begins).toISOString(),endsAt:new Date(begins+3600000).toISOString()});
   }
  }
 }
 return [...result.values()].sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
}
export async function ensureWeeklyEventSlots(db:D1Database,eventId:string,now=new Date()):Promise<void>{
 const rule=await db.prepare('SELECT weekly_windows,horizon_days,capacity FROM event_weekly_slot_rules WHERE event_id=? AND is_active=1').bind(eventId).first<{weekly_windows:string;horizon_days:number;capacity:number}>();
 if(!rule)return;
 const slots=buildWeeklySlots(eventId,JSON.parse(rule.weekly_windows),now,rule.horizon_days);
 if(!slots.length)return;
 // Include soft-deleted dates so a manager's closed appointment stays closed.
 const existing=await db.prepare('SELECT id FROM event_slots WHERE event_id=? AND starts_at>=? AND starts_at<=?').bind(eventId,slots[0].startsAt,slots[slots.length-1].startsAt).all<{id:string}>();
 const ids=new Set((existing.results??[]).map(s=>s.id));
 const statements=slots.filter(s=>!ids.has(s.id)).map(s=>db.prepare('INSERT OR IGNORE INTO event_slots (id,event_id,starts_at,ends_at,capacity,is_active,sort_order) VALUES(?,?,?,?,?,1,0)').bind(s.id,eventId,s.startsAt,s.endsAt,rule.capacity));
 if(statements.length)await db.batch(statements);
}
