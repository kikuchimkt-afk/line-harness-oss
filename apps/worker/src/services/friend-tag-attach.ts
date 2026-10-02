import {
  getFriendById,
  getLineAccountById,
  getScenarios,
  enrollFriendInScenario,
  jstNow,
} from '@line-crm/db';
import { fireEvent } from './event-bus.js';
import { applyTagRichMenuBinding } from './rich-menu-tag-binding.js';

// friend に tag を attach し、`POST /api/friends/:id/tags` と同じ side effects を発火する。
// side effects: tag_added シナリオ enrollment + tag_change イベント (automation/webhook/scoring 用)。
//
// 新規付与のときだけ side effects を発火する (`changes` を見る)。同じ friend に同じ tag を
// 自動付与で繰り返し叩いたとき、シナリオの重複 enrollment や tag_change の重複発火を防ぐ。
//
// POST /api/friends/:id/tags は手動操作の signal として「毎クリックで発火」する設計のため、
// この helper には合流させていない (重複 enroll はチェックがあるが tag_change は冪等でない)。
// 自動経路 (予約 auto-tag 等) はここ経由で呼ぶ。
export async function attachTagAndFireSideEffects(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<{ added: boolean }> {
  const friend = await getFriendById(db, friendId);
  const accountId = friend?.line_account_id ?? null;
  const account = accountId ? await getLineAccountById(db, accountId) : null;

  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at)
       VALUES (?, ?, ?)`,
    )
    .bind(friendId, tagId, jstNow())
    .run();
  const added = (result.meta?.changes ?? 0) > 0;

  if (added) {
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      if (
        scenario.trigger_type === 'tag_added' &&
        scenario.is_active &&
        scenario.trigger_tag_id === tagId &&
        (!scenario.line_account_id || scenario.line_account_id === accountId)
      ) {
        const existing = await db
          .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
          .bind(friendId, scenario.id)
          .first();
        if (!existing) {
          await enrollFriendInScenario(db, friendId, scenario.id);
        }
      }
    }

  }

  // Always retry the persisted rich-menu binding, even when the tag already
  // existed. This lets an existing friend reopen an entry link after a
  // transient LINE API failure and receive the intended menu without creating
  // duplicate scenario enrollments or tag-change events.
  try {
    await applyTagRichMenuBinding(db, friendId, tagId);
  } catch (error) {
    console.error(
      `[friend-tag-attach] rich-menu auto-apply failed friend=${friendId} tag=${tagId}:`,
      error,
    );
  }

  if (added) {
    await fireEvent(
      db,
      'tag_change',
      { friendId, eventData: { tagId, action: 'add' } },
      account?.channel_access_token,
      accountId,
    );
  }

  return { added };
}
