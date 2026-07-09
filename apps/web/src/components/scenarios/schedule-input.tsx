'use client'

import type { DeliveryMode } from '@line-crm/shared'

export interface ScheduleValue {
  delayMinutes: number
  offsetDays: number
  offsetHours: number
  offsetMinutesRemainder: number
  deliveryTime: string
}

export const emptySchedule: ScheduleValue = {
  delayMinutes: 0,
  offsetDays: 0,
  offsetHours: 0,
  offsetMinutesRemainder: 0,
  deliveryTime: '09:00',
}

/**
 * elapsed mode の DB 上の offsetMinutes は 0..1439 なので、
 * UI 側では 時間+分 に分けて編集する。
 */
export function offsetMinutesFromUI(value: ScheduleValue): number {
  return value.offsetHours * 60 + value.offsetMinutesRemainder
}

export function uiFromOffsetMinutes(offsetMinutes: number | null | undefined) {
  const m = offsetMinutes ?? 0
  return { offsetHours: Math.floor(m / 60), offsetMinutesRemainder: m % 60 }
}

interface Props {
  mode: DeliveryMode
  value: ScheduleValue
  onChange: (next: ScheduleValue) => void
  relativeBaseMinutes?: number
}

const inputCls =
  'w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function localDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function todayMidnight(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

function dateFromOffsetDays(offsetDays: number): string {
  const date = todayMidnight()
  date.setDate(date.getDate() + Math.max(0, offsetDays))
  return localDateInputValue(date)
}

function offsetDaysFromDate(dateValue: string): number {
  if (!dateValue) return 0
  const selected = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(selected.getTime())) return 0
  const diff = selected.getTime() - todayMidnight().getTime()
  return Math.max(0, Math.round(diff / 86_400_000))
}

function splitTime(time: string): { hour: string; minute: string } {
  const [h = '09', m = '00'] = time.split(':')
  return { hour: pad2(Math.max(0, Math.min(23, Number(h) || 0))), minute: pad2(Math.max(0, Math.min(59, Number(m) || 0))) }
}

function buildTime(hour: string, minute: string): string {
  return `${pad2(Number(hour) || 0)}:${pad2(Number(minute) || 0)}`
}

function currentDateTimeLabel(): string {
  const now = new Date()
  const date = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  })
  const time = now.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date} ${time}`
}

function dateTimeFromMinutesAfterNow(minutes: number): Date {
  const date = new Date()
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() + Math.max(0, minutes))
  return date
}

function timeInputValue(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function minutesBetween(base: Date, target: Date): number {
  return Math.max(0, Math.round((target.getTime() - base.getTime()) / 60_000))
}

export default function ScheduleInput({ mode, value, onChange, relativeBaseMinutes = 0 }: Props) {
  if (mode === 'relative') {
    const baseDate = dateTimeFromMinutesAfterNow(relativeBaseMinutes)
    const targetDate = dateTimeFromMinutesAfterNow(relativeBaseMinutes + value.delayMinutes)
    const targetDateValue = localDateInputValue(targetDate)
    const targetTimeValue = timeInputValue(targetDate)
    const updateFromDateTime = (dateValue: string, timeValue: string) => {
      if (!dateValue || !timeValue) return
      const target = new Date(`${dateValue}T${timeValue}:00`)
      if (Number.isNaN(target.getTime())) return
      onChange({ ...value, delayMinutes: minutesBetween(baseDate, target) })
    }

    return (
      <div className="space-y-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">遅延 (分)</label>
        <input
          type="number"
          min={0}
          className={inputCls + ' w-full'}
          value={value.delayMinutes}
          onChange={(e) => onChange({ ...value, delayMinutes: Math.max(0, Number(e.target.value) || 0) })}
        />
        <p className="text-xs text-gray-400 mt-0.5">前のステップから</p>

        <div className="rounded-lg border border-pink-100 bg-white/70 p-3">
          <label className="block text-xs font-medium text-gray-700 mb-2">
            カレンダーで日時指定
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={targetDateValue}
              onChange={(e) => updateFromDateTime(e.target.value, targetTimeValue)}
            />
            <input
              type="time"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={targetTimeValue}
              onChange={(e) => updateFromDateTime(targetDateValue, e.target.value)}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            現在時刻 {currentDateTimeLabel()}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            保存時は「前のステップから {value.delayMinutes} 分後」に自動換算します。
            {relativeBaseMinutes > 0
              ? ` 前のステップまでの目安は、開始から ${relativeBaseMinutes} 分後です。`
              : ' 前のステップが即時の場合、この日時がそのまま目安になります。'}
          </p>
        </div>
      </div>
    )
  }
  if (mode === 'elapsed') {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">購読開始から</label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={value.offsetDays}
            onChange={(e) => onChange({ ...value, offsetDays: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-sm text-gray-700">日</span>
          <input
            type="number"
            min={0}
            max={23}
            className={inputCls}
            value={value.offsetHours}
            onChange={(e) =>
              onChange({ ...value, offsetHours: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })
            }
          />
          <span className="text-sm text-gray-700">時間</span>
          <input
            type="number"
            min={0}
            max={59}
            className={inputCls}
            value={value.offsetMinutesRemainder}
            onChange={(e) =>
              onChange({
                ...value,
                offsetMinutesRemainder: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
              })
            }
          />
          <span className="text-sm text-gray-700">分後に配信</span>
        </div>
      </div>
    )
  }
  // absolute_time
  const selectedTime = splitTime(value.deliveryTime)
  const selectedDate = dateFromOffsetDays(value.offsetDays)
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] text-white">✓</span>
        送信日時を指定
      </label>
      <div className="rounded-lg border border-pink-100 bg-white/70 p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            value={selectedDate}
            onChange={(e) => onChange({ ...value, offsetDays: offsetDaysFromDate(e.target.value) })}
          />
          <span className="text-xs text-gray-500">
            {value.offsetDays === 0 ? '開始当日' : `開始から${value.offsetDays}日後`}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">現在時刻 {currentDateTimeLabel()}</p>
        <label className="mt-3 flex items-center gap-2 text-xs font-medium text-gray-700">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-pink-500 text-[10px] text-white">✓</span>
          更に、送信時刻を指定する
        </label>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            value={selectedTime.hour}
            onChange={(e) => onChange({ ...value, deliveryTime: buildTime(e.target.value, selectedTime.minute) })}
          >
            {Array.from({ length: 24 }, (_, hour) => pad2(hour)).map((hour) => (
              <option key={hour} value={hour}>{hour}</option>
            ))}
          </select>
          <span className="text-sm text-gray-700">時</span>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            value={selectedTime.minute}
            onChange={(e) => onChange({ ...value, deliveryTime: buildTime(selectedTime.hour, e.target.value) })}
          >
            {Array.from({ length: 60 }, (_, minute) => pad2(minute)).map((minute) => (
              <option key={minute} value={minute}>{minute}</option>
            ))}
          </select>
          <span className="text-sm text-gray-700">分</span>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        ⓘ 日付は「今日友だち追加された場合」の目安です。保存時は「開始から{value.offsetDays}日後の {value.deliveryTime}」として配信されます。
      </p>
      <p className="text-xs text-gray-400">ⓘ cron が 5 分粒度のため最大 5 分遅れる場合があります</p>
    </div>
  )
}

/**
 * ScheduleValue → API リクエストの schedule フィールド (delivery_mode に応じて取捨選択)
 */
export function buildSchedulePayload(mode: DeliveryMode, value: ScheduleValue) {
  if (mode === 'relative') {
    return { delayMinutes: value.delayMinutes }
  }
  if (mode === 'elapsed') {
    return {
      offsetDays: value.offsetDays,
      offsetMinutes: offsetMinutesFromUI(value),
    }
  }
  return {
    offsetDays: value.offsetDays,
    deliveryTime: value.deliveryTime,
  }
}
