import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type EventBookingFormField, type EventDetail, type EventSlot } from '../lib/api.js';

function formatJp(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
}

function nanoid(): string {
  return crypto.randomUUID();
}

type FormAnswers = Record<string, string | string[]>;

function parseFormFields(raw: EventDetail['booking_form_fields']): EventBookingFormField[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as EventBookingFormField[]) : [];
  } catch {
    return [];
  }
}

function getTextAnswer(answers: FormAnswers, id: string): string {
  const value = answers[id];
  return typeof value === 'string' ? value : '';
}

function getListAnswer(answers: FormAnswers, id: string): string[] {
  const value = answers[id];
  return Array.isArray(value) ? value : [];
}

export default function EventConfirm() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const slotId = search.get('slotId') ?? '';
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [slot, setSlot] = useState<EventSlot | null>(null);
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable Idempotency-Key — regenerate would defeat the purpose if user
  // taps twice. One key per Confirm-screen mount.
  const idemKey = useMemo(() => nanoid(), []);

  useEffect(() => {
    if (!id || !slotId) return;
    let cancelled = false;
    async function load() {
      try {
        const [e, s] = await Promise.all([api.getEvent(id!), api.getEventSlots(id!)]);
        if (cancelled) return;
        setEvent(e);
        const found = s.items.find((x) => x.id === slotId);
        if (!found) {
          // 枠が消えた / 満員でフィルタアウト / 開始済 → 詳細画面に戻すべき。
          // null のまま放置すると無限ローディングになる。
          setError('選択した枠は受付終了しました。別の日時をお選びください。');
          return;
        }
        setSlot(found);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [id, slotId]);

  async function submit() {
    if (!id || !slotId) return;
    const formFields = event ? parseFormFields(event.booking_form_fields) : [];
    for (const field of formFields) {
      const value = answers[field.id];
      if (field.type === 'checkbox') {
        if (field.required && (!Array.isArray(value) || value.length === 0)) {
          setError(`${field.label}を選択してください`);
          return;
        }
        continue;
      }
      const text = typeof value === 'string' ? value.trim() : '';
      if (field.required && !text) {
        setError(`${field.label}を入力してください`);
        return;
      }
    }
    if (note.length > 5000) {
      setError('備考は5000字以内で入力してください');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createEventBooking(
        id,
        { slot_id: slotId, customer_note: note || null, form_answers: answers },
        idemKey,
      );
      navigate(`/events/${id}/done?bookingId=${res.id}&status=${res.status}`);
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string } };
      const code = e.body?.error;
      const msg = (() => {
        switch (code) {
          case 'slot_full': return 'すでに満員になりました。別の日時をお選びください。';
          case 'over_friend_limit': return 'このイベントへの予約上限に達しています。';
          case 'slot_started': return 'この枠は既に開始されています。';
          case 'slot_inactive': return 'この枠は受付を締め切りました。';
          case 'event_unpublished': return 'このイベントは現在受付を停止しています。';
          case 'unauthorized':
          case 'friend_not_found':
            return 'LINE 認証に失敗しました。一度 LINE のトークルームに戻り、友だち追加が完了していることを確認してから再度お試しください。';
          case 'idempotent_in_progress': return '前回のリクエストを処理中です。少しお待ちください。';
          default: return err instanceof Error ? err.message : String(err);
        }
      })();
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-700 mb-4">{error}</div>
        <button
          onClick={() => navigate(`/events/${id}`)}
          className="px-4 py-2 border rounded"
        >
          イベントページに戻る
        </button>
      </div>
    );
  }
  if (!event || !slot) {
    return <div className="p-8 text-center text-gray-500">読み込み中...</div>;
  }
  const formFields = parseFormFields(event.booking_form_fields);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  return (
    <div className="p-4 pb-20">
      <h1 className="text-lg font-bold mb-3">予約内容の確認</h1>
      <div className="border rounded p-3 mb-4 space-y-1">
        <div className="text-sm font-semibold">{event.name}</div>
        <div className="text-sm text-gray-700">📅 {formatJp(slot.starts_at)}</div>
        {event.venue_name && <div className="text-sm text-gray-700">📍 {event.venue_name}</div>}
      </div>

      {event.requires_approval === 1 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-xs rounded p-2 mb-3">
          このイベントは承認制です。受付後、運営が承認するまでお待ちください。
        </div>
      )}

      {formFields.length > 0 && (
        <div className="space-y-3 mb-4">
          <h2 className="text-sm font-bold">必要事項</h2>
          {formFields.map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={getTextAnswer(answers, field.id)}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="w-full border rounded p-2 text-sm"
                  placeholder={field.placeholder || '入力してください'}
                />
              ) : field.type === 'select' ? (
                <select
                  value={getTextAnswer(answers, field.id)}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  className="w-full border rounded p-2 text-sm"
                >
                  <option value="">選択してください</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <div className="space-y-2">
                  {(field.options ?? []).map((option) => {
                    const selected = getListAnswer(answers, field.id).includes(option);
                    return (
                      <label key={option} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = getListAnswer(answers, field.id);
                            setAnswer(
                              field.id,
                              e.target.checked
                                ? [...current, option]
                                : current.filter((x) => x !== option),
                            );
                          }}
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={getTextAnswer(answers, field.id)}
                  onChange={(e) => setAnswer(field.id, e.target.value)}
                  maxLength={2000}
                  className="w-full border rounded p-2 text-sm"
                  placeholder={field.placeholder || '入力してください'}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <label className="block text-sm font-medium mb-1">備考（任意）</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={5000}
        className="w-full border rounded p-2 text-sm"
        placeholder="質問や伝えたいことがあれば..."
      />
      <div className="text-xs text-gray-500 text-right">{note.length} / 5000</div>

      {error && <div className="bg-red-50 text-red-700 p-2 rounded mt-2 text-sm">{error}</div>}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-5 w-full py-3 bg-blue-600 text-white rounded font-medium disabled:opacity-50"
      >
        {submitting ? '送信中...' : '予約をリクエスト'}
      </button>
      <button
        onClick={() => navigate(-1)}
        disabled={submitting}
        className="mt-2 w-full py-2 text-gray-600 text-sm"
      >
        戻る
      </button>
    </div>
  );
}
