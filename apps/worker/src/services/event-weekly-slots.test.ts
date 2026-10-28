import {describe,expect,test} from 'vitest';
import {buildWeeklySlots,type WeeklyWindow} from './event-weekly-slots.js';
const windows:WeeklyWindow[]=[{weekday:2,start:'14:30',end:'17:30'},{weekday:3,start:'14:30',end:'17:30'},{weekday:4,start:'14:30',end:'15:30'},{weekday:5,start:'14:30',end:'18:30'},{weekday:6,start:'14:30',end:'18:30'}];
describe('recurring phone consultation availability',()=>{
 test('15 one-hour appointments on the requested weekdays in JST',()=>{
  const slots=buildWeeklySlots('phone',windows,new Date('2026-10-11T15:00:00Z'),7);
  expect(slots).toHaveLength(15);
  expect(slots[0].startsAt).toBe('2026-10-13T05:30:00.000Z');
  expect(slots[slots.length-1].endsAt).toBe('2026-10-17T09:30:00.000Z');
  expect(slots.filter(s=>s.id.includes('2026-10-15'))).toHaveLength(1);
  for(const s of slots)expect(Date.parse(s.endsAt)-Date.parse(s.startsAt)).toBe(3600000);
  expect(new Set(slots.map(s=>s.id)).size).toBe(15);
 });
 test('uses the JST date, excludes past starts and retains stable slot ids',()=>{
  const now=new Date('2026-10-13T06:30:00Z');
  const slots=buildWeeklySlots('phone',windows,now,1);
  expect(slots.map(s=>s.startsAt)).toEqual(['2026-10-13T07:30:00.000Z']);
  expect(buildWeeklySlots('phone',windows,now,1)).toEqual(slots);
  expect(buildWeeklySlots('phone',windows,new Date('2026-10-12T14:59:59Z'),1)).toEqual([]);
 });
});
