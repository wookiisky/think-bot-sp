import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConversationsApi } from '../../../src/features/conversations/conversations-api';
import { createSidebarApi } from '../../../src/features/sidebar/sidebar-api';
import {
  createConversationsWorkspaceTransport,
  createSidebarWorkspaceTransport,
} from '../../../src/features/workspace/workspace-transport';
import { requestRuntimeMessage } from '../../../src/shared/runtime-request';

vi.mock('../../../src/shared/runtime-request', () => ({ requestRuntimeMessage: vi.fn() }));

const pageUrl = 'https://example.com/article?source=sidebar';
const normalizedUrl = 'https://example.com/article';
const sendInput = {
  promptTabId: 'prompt', modelId: 'model', text: 'expanded text', displayText: 'shortcut',
  images: ['data:image/png;base64,image'], includePageContent: true, rollbackOnFailure: true,
};

describe('workspace transport', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('侧栏绑定页面和浏览器标签，并透传发送能力与返回值', async () => {
    const response = { type: 'SEND_CHAT_SUCCESS', payload: { sessionId: 'session' } };
    vi.mocked(requestRuntimeMessage).mockResolvedValue(response);
    const transport = createSidebarWorkspaceTransport({ api: createSidebarApi(), tabId: 42, pageUrl });

    await expect(transport.sendChat(sendInput)).resolves.toBe(response);
    expect(requestRuntimeMessage).toHaveBeenCalledWith({ type: 'SEND_CHAT', tabId: 42, pageUrl, ...sendInput });
    expect(transport.clearTabResetsTrigger).toBe(true);
    expect(transport.deleteLastBranchRemovesMessage).toBe(true);
    expect(transport.normalizedUrl).toBeUndefined();
  });

  it('历史页保留展示文本，且不向既有 API 传入回滚字段', async () => {
    const transport = createConversationsWorkspaceTransport({ api: createConversationsApi(), pageUrl, normalizedUrl });
    const { rollbackOnFailure: _rollback, ...expected } = sendInput;

    await transport.sendChat(sendInput);
    expect(requestRuntimeMessage).toHaveBeenCalledWith({ type: 'SEND_CHAT', tabId: 0, pageUrl, ...expected });
    expect(transport.clearTabResetsTrigger).toBe(false);
    expect(transport.deleteLastBranchRemovesMessage).toBe(false);
    expect(transport.normalizedUrl).toBe(normalizedUrl);
  });

  it.each(['sidebar', 'history'] as const)('%s 的命令与流订阅绑定同一页面', async (surface) => {
    const port = { postMessage: vi.fn() };
    vi.stubGlobal('chrome', { runtime: { connect: vi.fn(() => port) } });
    const transport = surface === 'sidebar'
      ? createSidebarWorkspaceTransport({ api: createSidebarApi(), tabId: 42, pageUrl })
      : createConversationsWorkspaceTransport({ api: createConversationsApi(), pageUrl, normalizedUrl });
    const scope = { tabId: surface === 'sidebar' ? 42 : 0, pageUrl, promptTabId: 'prompt' };

    await transport.editUserMessage({ promptTabId: 'prompt', messageId: 'user', text: 'edited' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'EDIT_USER_MESSAGE', ...scope, messageId: 'user', text: 'edited' });
    await transport.retryUserMessage({ promptTabId: 'prompt', messageId: 'user' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'RETRY_USER_MESSAGE', ...scope, messageId: 'user' });
    await transport.retryMessage({ promptTabId: 'prompt', messageId: 'reply', branchId: 'branch' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'RETRY_MESSAGE', ...scope, messageId: 'reply', branchId: 'branch' });
    await transport.selectAssistantBranch({ promptTabId: 'prompt', messageId: 'reply', branchId: 'branch' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'SELECT_ASSISTANT_BRANCH', ...scope, messageId: 'reply', branchId: 'branch' });
    await transport.expandMessageBranches({ promptTabId: 'prompt', messageId: 'reply', modelId: 'model' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'EXPAND_MESSAGE_BRANCHES', ...scope, messageId: 'reply', modelId: 'model' });
    await transport.stopSession({ promptTabId: 'prompt', sessionId: 'session' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'STOP_SESSION', ...scope, sessionId: 'session' });
    await transport.stopBranch({ promptTabId: 'prompt', branchId: 'branch' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'STOP_BRANCH', ...scope, branchId: 'branch' });
    await transport.deleteBranch({ promptTabId: 'prompt', messageId: 'reply', branchId: 'branch' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'DELETE_BRANCH', ...scope, messageId: 'reply', branchId: 'branch' });
    await transport.clearTabConversation({ promptTabId: 'prompt' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'CLEAR_TAB_CONVERSATION', ...scope });
    await transport.exportConversation({ promptTabId: 'prompt' });
    expect(requestRuntimeMessage).toHaveBeenLastCalledWith({ type: 'EXPORT_CONVERSATION', ...scope });
    expect(transport.connectStream({ promptTabId: 'prompt' })).toBe(port);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'SUBSCRIBE_SIDEBAR_STREAM', ...scope });
  });

  it('页面适配器不会吞掉底层命令错误', async () => {
    const error = new Error('transport failed');
    vi.mocked(requestRuntimeMessage).mockRejectedValue(error);
    const transport = createSidebarWorkspaceTransport({ api: createSidebarApi(), tabId: 42, pageUrl });
    await expect(transport.sendChat(sendInput)).rejects.toBe(error);
  });
});
