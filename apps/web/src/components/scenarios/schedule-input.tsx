'use client'

import type { DeliveryMode } from '@line-crm/shared'

export interface ScheduleValue {
  delayMinutes: number
  offsetDays: number
  offsetHours: number
  offsetMinutesRemainder: number
  deliveryTime: string
  relativeMode: 'time' | 'minutes'
}

export const emptySchedule: ScheduleValue = {
  delayMinutes: 0,
  offsetDays: 0,
  offsetHours: 0,
  offsetMinutesRemainder: 0,
  deliveryTime: '09:00',
  relativeMode: 'time',
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
}

const inputCls =
  'w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function splitTime(time: string): { hour: string; minute: string } {
  const [h = '09', m = '00'] = time.split(':')
  return {
    hour: pad2(Math.max(0, Math.min(23, Number(h) || 0))),
    minute: pad2(Math.max(0, Math.min(59, Number(m) || 0))),
  }
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

function TimePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const selectedTime = splitTime(value)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        value={selectedTime.hour}
        onChange={(e) => onChange(buildTime(e.target.value, selectedTime.minute))}
      >
        {Array.from({ length: 24 }, (_, hour) => pad2(hour)).map((hour) => (
          <option key={hour} value={hour}>{hour}</option>
        ))}
      </select>
      <span className="text-sm text-gray-700">時</span>
      <select
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        value={selectedTime.minute}
        onChange={(e) => onChange(buildTime(selectedTime.hour, e.target.value))}
      >
        {Array.from({ length: 60 }, (_, minute) => pad2(minute)).map((minute) => (
          <option key={minute} value={minute}>{minute}</option>
        ))}
      </select>
      <span className="text-sm text-gray-700">分</span>
    </div>
  )
}

export default function ScheduleInput({ mode, value, onChange }: Props) {
  if (mode === 'relative') {
    return (
      <div className="space-y-3">
        <label className="block text-xs font-medium text-gray-600">配信タイミング</label>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onChange({ ...value, relativeMode: 'time' })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              value.relativeMode === 'time'
                ? 'border-pink-300 bg-pink-100 text-pink-700'
                : 'border-pink-100 bg-white/70 text-gray-600 hover:bg-pink-50'
            }`}
          >
            何日後の時刻
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...value, relativeMode: 'minutes' })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              value.relativeMode === 'minutes'
                ? 'border-pink-300 bg-pink-100 text-pink-700'
                : 'border-pink-100 bg-white/70 text-gray-600 hover:bg-pink-50'
            }`}
          >
            分で指定
          </button>
        </div>

        {value.relativeMode === 'time' ? (
          <div className="rounded-lg border border-pink-100 bg-white/70 p-3">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              前のステップ配信後から
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={value.offsetDays}
                onChange={(e) => onChange({ ...value, offsetDays: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className="text-sm text-gray-700">日後の</span>
              <TimePicker
                value={value.deliveryTime}
                onChange={(deliveryTime) => onChange({ ...value, deliveryTime })}
              />
              <span className="text-sm text-gray-700">に配信</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              ステップ1が友だち追加直後に配信される場合、次のステップは友だち追加から {value.offsetDays} 日後の {value.deliveryTime} に送られます。
            </p>
            <p className="mt-1 text-xs text-gray-400">現在時刻 {currentDateTimeLabel()}</p>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">遅延 (分)</label>
            <input
              type="number"
              min={0}
              className={inputCls + ' w-full'}
              value={value.delayMinutes}
              onChange={(e) => onChange({ ...value, delayMinutes: Math.max(0, Number(e.target.value) || 0) })}
            />
            <p className="text-xs text-gray-400 mt-0.5">前のステップから。既存シナリオとの互換用です。</p>
          </div>
        )}
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

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] text-white">✓</span>
        シナリオ開始から
      </label>
      <div className="rounded-lg border border-pink-100 bg-white/70 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={value.offsetDays}
            onChange={(e) => onChange({ ...value, offsetDays: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-sm text-gray-700">日後の</span>
          <TimePicker
            value={value.deliveryTime}
            onChange={(deliveryTime) => onChange({ ...value, deliveryTime })}
          />
          <span className="text-sm text-gray-700">に配信</span>
        </div>
        <p className="mt-2 text-xs text-gray-500">現在時刻 {currentDateTimeLabel()}</p>
      </div>
      <p className="text-xs text-gray-400">
        保存時は「シナリオ開始から{value.offsetDays}日後の {value.deliveryTime}」として配信されます。
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
    if (value.relativeMode === 'time') {
      return {
        offsetDays: value.offsetDays,
        offsetMinutes: null,
        deliveryTime: value.deliveryTime,
      }
    }
    return {
      delayMinutes: value.delayMinutes,
      offsetDays: null,
      offsetMinutes: null,
      deliveryTime: null,
    }
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
