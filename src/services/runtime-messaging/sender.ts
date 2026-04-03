/** sidebar 消息发送方的最小结构。 */
export type SidebarMessageSender = {
  /** 扩展 id。 */
  id?: string | null;
  /** 发送方 URL。 */
  url?: string | null;
};

/** 判断 sender 是否来自 sidepanel.html。 */
export const isSidebarPageSender = (sender: SidebarMessageSender, runtimeId: string): boolean => {
  if (!sender.id || sender.id !== runtimeId) {
    return false;
  }

  if (!sender.url) {
    return false;
  }

  try {
    return new URL(sender.url).pathname.endsWith('/sidepanel.html');
  } catch {
    return false;
  }
};

/** 断言 sender 必须来自 sidepanel.html。 */
export const assertSidebarPageSender = (sender: SidebarMessageSender, runtimeId: string): void => {
  if (!isSidebarPageSender(sender, runtimeId)) {
    throw new Error('invalid sidebar sender: expected runtime id and sidepanel.html');
  }
};
