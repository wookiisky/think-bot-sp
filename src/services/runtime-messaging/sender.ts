/** sidebar 消息发送方的最小结构。 */
export type SidebarMessageSender = {
  /** 扩展 id。 */
  id?: string | null;
  /** 发送方 URL。 */
  url?: string | null;
};

/** 判断 sender 是否来自指定扩展页面。 */
export const isExtensionPageSender = (sender: SidebarMessageSender, runtimeId: string, pagePath: string): boolean => {
  if (!sender.id || sender.id !== runtimeId) {
    return false;
  }

  if (!sender.url) {
    return false;
  }

  try {
    return new URL(sender.url).pathname.endsWith(pagePath);
  } catch {
    return false;
  }
};

/** 判断 sender 是否来自 sidebar.html。 */
export const isSidebarPageSender = (sender: SidebarMessageSender, runtimeId: string): boolean =>
  isExtensionPageSender(sender, runtimeId, '/sidebar.html');

/** 判断 sender 是否来自 conversations.html。 */
export const isConversationsPageSender = (sender: SidebarMessageSender, runtimeId: string): boolean =>
  isExtensionPageSender(sender, runtimeId, '/conversations.html');

/** 断言 sender 必须来自 sidebar.html。 */
export const assertSidebarPageSender = (sender: SidebarMessageSender, runtimeId: string): void => {
  if (!isSidebarPageSender(sender, runtimeId)) {
    throw new Error('invalid sidebar sender: expected runtime id and sidebar.html');
  }
};

/** 断言 sender 必须来自 conversations.html。 */
export const assertConversationsPageSender = (sender: SidebarMessageSender, runtimeId: string): void => {
  if (!isConversationsPageSender(sender, runtimeId)) {
    throw new Error('invalid conversations sender: expected runtime id and conversations.html');
  }
};
