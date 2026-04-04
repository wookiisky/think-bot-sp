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
    /** 错误消息。 */
    errorMessage: string | null;
    /** 当前消息下的分支列表。 */
    branches: Array<{
      /** 分支 id。 */
      id: string;
      /** 分支模型 id。 */
      modelId: string;
      /** 分支模型展示名。 */
      modelLabel: string;
      /** 分支内容。 */
      content: string;
      /** 分支状态。 */
      status: 'loading' | 'done' | 'error' | 'cancelled';
      /** 分支错误消息。 */
      errorMessage: string | null;
    }>;
  }>;
  /** 当前恢复中的助手消息 id。 */
  restoreMessageId: string | null;
  /** 当前编辑中的用户消息 id。 */
  editingMessageId: string | null;
  /** 当前编辑草稿。 */
  editingText: string;
  /** 开始编辑用户消息。 */
  onStartEdit: (messageId: string, content: string) => void;
  /** 更新编辑草稿。 */
  onEditingTextChange: (text: string) => void;
  /** 取消编辑。 */
  onCancelEdit: () => void;
  /** 提交编辑。 */
  onSubmitEdit: (messageId: string) => Promise<void>;
  /** 重试目标助手消息。 */
  onRetryMessage: (messageId: string) => Promise<void>;
  /** 继续新增分支。 */
  onExpandBranches: (messageId: string) => Promise<void>;
  /** 停止单个分支。 */
  onStopBranch: (messageId: string, branchId: string) => Promise<void>;
  /** 删除单个分支。 */
  onDeleteBranch: (messageId: string, branchId: string) => Promise<void>;
};

/** 侧边栏聊天消息区。 */
export const ChatThread = ({
  messages,
  restoreMessageId,
  editingMessageId,
  editingText,
  onStartEdit,
  onEditingTextChange,
  onCancelEdit,
  onSubmitEdit,
  onRetryMessage,
  onExpandBranches,
  onStopBranch,
  onDeleteBranch,
}: ChatThreadProps) => (
  <section className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
    {messages.length === 0 ? <p className="text-sm text-muted-foreground">还没有聊天记录。</p> : null}
    {messages.map((message) => (
      <article key={message.id} className="rounded-lg border border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">{message.role === 'user' ? '你' : message.role === 'assistant' ? '助手' : '系统'}</p>
        {message.role === 'user' && editingMessageId === message.id ? (
          <div className="mt-2 space-y-2">
            <textarea
              aria-label="编辑消息输入"
              className="min-h-24 w-full rounded-md border border-border bg-background p-3"
              value={editingText}
              onChange={(event) => onEditingTextChange(event.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" disabled={editingText.trim().length === 0} onClick={() => void onSubmitEdit(message.id)}>
                保存并重发
              </button>
              <button type="button" onClick={onCancelEdit}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message.content || '...'}</div>
        )}
        {restoreMessageId === message.id ? <p className="mt-2 text-xs text-muted-foreground">恢复生成中…</p> : null}
        {message.status === 'error' ? (
          <p className="mt-2 text-xs text-destructive">{message.errorMessage ?? '生成失败'}</p>
        ) : null}
        {message.status === 'cancelled' ? <p className="mt-2 text-xs text-muted-foreground">{message.errorMessage ?? '已停止'}</p> : null}
        {message.role === 'user' && editingMessageId !== message.id ? (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onStartEdit(message.id, message.content)}>
              编辑
            </button>
          </div>
        ) : null}
        {message.role === 'assistant' && message.status !== 'loading' ? (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void onRetryMessage(message.id)}>
              重试
            </button>
            <button type="button" onClick={() => void onExpandBranches(message.id)}>
              继续新增分支
            </button>
          </div>
        ) : null}
        {message.branches.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {message.branches.map((branch) => (
              <section key={branch.id} data-testid={`branch-${branch.id}`} className="rounded-md border border-border/80 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">分支 · {branch.modelLabel}</p>
                    <div className="whitespace-pre-wrap">{branch.content || '...'}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {branch.status === 'loading' ? (
                      <button type="button" onClick={() => void onStopBranch(message.id, branch.id)}>
                        停止分支
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void onDeleteBranch(message.id, branch.id)}>
                      删除分支
                    </button>
                  </div>
                </div>
                {branch.status === 'loading' ? <p className="mt-2 text-xs text-muted-foreground">分支生成中…</p> : null}
                {branch.status === 'error' ? (
                  <p className="mt-2 text-xs text-destructive">{branch.errorMessage ?? '分支生成失败'}</p>
                ) : null}
                {branch.status === 'cancelled' ? (
                  <p className="mt-2 text-xs text-muted-foreground">{branch.errorMessage ?? '分支已停止'}</p>
                ) : null}
              </section>
            ))}
          </div>
        ) : null}
      </article>
    ))}
  </section>
);
