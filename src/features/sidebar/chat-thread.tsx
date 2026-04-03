type ChatThreadProps = {
  /** 当前消息列表。 */
  messages: Array<{
    /** 消息 id。 */
    id: string;
    /** 角色。 */
    role: 'user' | 'assistant' | 'system';
    /** 内容。 */
    content: string;
    /** 状态。 */
    status: 'loading' | 'done' | 'error' | 'cancelled';
  }>;
  /** 当前恢复中的助手消息 id。 */
  restoreMessageId: string | null;
};

/** 侧边栏聊天消息区。 */
export const ChatThread = ({ messages, restoreMessageId }: ChatThreadProps) => (
  <section className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
    {messages.length === 0 ? <p className="text-sm text-muted-foreground">还没有聊天记录。</p> : null}
    {messages.map((message) => (
      <article key={message.id} className="rounded-lg border border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">{message.role === 'user' ? '你' : message.role === 'assistant' ? '助手' : '系统'}</p>
        <div className="whitespace-pre-wrap">{message.content || '...'}</div>
        {restoreMessageId === message.id ? <p className="mt-2 text-xs text-muted-foreground">恢复生成中…</p> : null}
        {message.status === 'error' ? <p className="mt-2 text-xs text-destructive">生成失败</p> : null}
        {message.status === 'cancelled' ? <p className="mt-2 text-xs text-muted-foreground">已停止</p> : null}
      </article>
    ))}
  </section>
);
