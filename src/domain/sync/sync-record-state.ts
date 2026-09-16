import type { PageRecord } from '../page/page-schema';
import type { SyncSnapshot } from './sync-snapshot-schema';

/** 保留主要页面的运行态，但清空记录跨页面版本单调递增。 */
export const mergePromptTabClearHistory = (primary: PageRecord, secondary?: PageRecord | null): PageRecord['promptTabStates'] => {
  const states = new Map(primary.promptTabStates.map((state) => [state.promptTabId, state]));
  for (const state of secondary?.promptTabStates ?? []) {
    const current = states.get(state.promptTabId);
    if (!current) {
      if (state.lastClearedAt !== null) states.set(state.promptTabId, state);
    } else if (state.lastClearedAt !== null && (current.lastClearedAt === null || state.lastClearedAt > current.lastClearedAt)) {
      states.set(state.promptTabId, { ...current, lastClearedAt: state.lastClearedAt });
    }
  }
  return [...states.values()];
};

/** 清空时间包含同一毫秒的旧消息；旧会话后续更新不能恢复已清空的历史。 */
export const isSyncConversationVisible = (conversation: SyncSnapshot['conversations'][number], page?: PageRecord): boolean => {
  if (!page) return false;
  const clearedAt = page.promptTabStates.find((state) => state.promptTabId === conversation.promptTabId)?.lastClearedAt;
  if (clearedAt == null) return true;
  return conversation.messages.length > 0
    ? conversation.messages.every((message) => message.createdAt > clearedAt)
    : conversation.updatedAt > clearedAt;
};
