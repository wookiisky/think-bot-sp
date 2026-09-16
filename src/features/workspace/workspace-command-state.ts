import {
  omitMessageDisplayContent,
  syncAssistantMessageState,
  type ChatMessageState,
} from './workspace-state';

/** 后台为新一轮回答返回的分支身份。 */
type CommandBranch = {
  /** 分支 id。 */
  branchId: string;
  /** 模型 id。 */
  modelId: string;
  /** 模型展示名。 */
  modelLabel: string;
};

/** 命令完成后需要与已到达的流事件合并的状态。 */
type WorkspaceCommandResult = {
  /** 用户编辑或重试所定位的原消息。 */
  targetMessageId: string;
  /** 新一轮回复的身份。 */
  response: { messageId: string; branchId: string };
} & (
  | {
      /** 编辑与重试用户消息均裁剪之后的旧轮次。 */
      kind: 'user';
      /** 编辑时替换正文；重试时不提供。 */
      editedText?: string;
      /** 新一轮回复使用的模型与分支身份。 */
      response: CommandBranch & { messageId: string; branches?: CommandBranch[] };
    }
  | {
      /** 助手重试复用原消息与分支 id。 */
      kind: 'assistant';
      /** 只按本次 session 判断，不能将上一轮的终态当成本次流进度。 */
      hasStreamEvent: boolean;
    }
);

/** 命令只补齐身份与裁剪历史，已收到的本轮正文、错误及终态优先。 */
export const mergeWorkspaceCommandResult = (messages: ChatMessageState[], result: WorkspaceCommandResult): ChatMessageState[] => {
  const role = result.kind === 'user' ? 'user' : 'assistant';
  const targetIndex = messages.findIndex((message) => message.id === result.targetMessageId && message.role === role);
  if (targetIndex < 0) return messages;
  const retained = messages.slice(0, targetIndex + 1);

  if (result.kind === 'assistant') {
    if (result.hasStreamEvent) return retained;
    return retained.map((message) => message.id !== result.targetMessageId ? message : syncAssistantMessageState({
      ...message,
      branches: message.branches.map((branch) => branch.id !== result.response.branchId ? branch : {
        ...branch, content: '', status: 'loading', errorMessage: null, durationMs: null, startedAt: null,
      }),
    }));
  }

  const { response } = result;
  if (result.editedText !== undefined) {
    const target = retained[targetIndex]!;
    retained[targetIndex] = { ...omitMessageDisplayContent(target), content: result.editedText };
  }
  const streamed = messages.find((message) => message.id === response.messageId && message.role === 'assistant');
  const assistant: ChatMessageState = streamed ?? {
    id: response.messageId, role: 'assistant', content: '', status: 'loading', errorMessage: null,
    branches: [], selectedBranchId: response.branchId,
  };
  const branches = [...assistant.branches];
  for (const descriptor of response.branches ?? [response]) {
    const index = branches.findIndex((branch) => branch.id === descriptor.branchId);
    const existing = branches[index];
    // 首个事件可能就是主流终态，尚未创建分支；新分支继承该终态。
    const branch = {
      id: descriptor.branchId, modelId: descriptor.modelId, modelLabel: descriptor.modelLabel,
      isPrimary: descriptor.branchId === response.branchId,
      content: existing?.content ?? (descriptor.branchId === response.branchId ? assistant.content : ''),
      status: existing?.status ?? (descriptor.branchId === response.branchId ? assistant.status : 'loading'),
      errorMessage: existing?.errorMessage ?? (descriptor.branchId === response.branchId ? assistant.errorMessage : null),
      durationMs: existing?.durationMs ?? null, startedAt: existing?.startedAt ?? null,
    };
    if (index < 0) branches.push(branch);
    else branches[index] = { ...existing!, modelId: descriptor.modelId, modelLabel: descriptor.modelLabel };
  }
  return [...retained, syncAssistantMessageState({ ...assistant, branches })];
};
