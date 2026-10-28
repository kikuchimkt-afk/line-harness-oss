import { isFriendBlocked, stopBlockedFriendWork } from './friend-block-policy.js';

/** Preserve ordinary tag semantics while enforcing control-tag effects before
 * the caller can continue to enroll or confirm another customer action. */
export async function addTagWithBlockEnforcement(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<boolean> {
  const { addTagToFriend } = await import('@line-crm/db');
  await addTagToFriend(db, friendId, tagId);
  if (!(await isFriendBlocked(db, friendId))) return false;

  await stopBlockedFriendWork(db, friendId);
  const { cancelBlockedFriendOutboundWork } = await import('./blocked-outbound.js');
  await cancelBlockedFriendOutboundWork(db, friendId);
  // The tag and durable maintenance keep send gates closed if LINE is down.
  // Do not let a menu failure undo the successfully saved block decision.
  try {
    const { applyBlockedRichMenuForFriend } = await import('./rich-menu-assignment.js');
    await applyBlockedRichMenuForFriend(db, friendId);
  } catch {
    console.error('[block-tag] dedicated menu deferred to durable maintenance');
  }
  return true;
}
