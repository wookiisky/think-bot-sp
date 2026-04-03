import { useEffect, useState } from 'react';

import { getEnabledCompleteModels } from '../../domain/config/config-schema';
import { ChatInput } from './chat-input';
import { ChatThread } from './chat-thread';
import type { SidebarApi } from './sidebar-api';

type ExtractionMethod = 'readability' | 'jina';
type SidebarState = 'bootstrapping' | 'blocked' | 'extracting' | 'ready' | 'error';
type ChatMessageState = {
  /** 消息 id。 */
  id: string;
  /** 角色。 */
  role: 'user' | 'assistant' | 'system';
  /** 内容。 */
  content: string;
  /** 状态。 */
  status: 'loading' | 'done' | 'error' | 'cancelled';
};
type ModelOption = {
  /** 模型稳定 id。 */
  id: string;
  /** 展示名。 */
  name: string;
  /** 是否支持图片输入。 */
  supportsImages: boolean;
};

type SidebarShellProps = {
  /** side panel 消息 API。 */
  api: SidebarApi;
  /** 当前浏览器标签页 id。 */
  tabId: number;
  /** 当前页面 URL。 */
  pageUrl: string;
};

const CHAT_PROMPT_TAB_ID = 'chat';

/** 以 assistant 消息 id 为键做增量合并。 */
const upsertAssistantMessage = (
  messages: ChatMessageState[],
  messageId: string,
  buildNext: (current: ChatMessageState | null) => ChatMessageState,
) => {
  let found = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    found = true;
    return buildNext(message);
  });

  return found ? next : [...next, buildNext(null)];
};

/** 生成本地乐观用户消息内容。 */
const toOptimisticUserContent = (text: string, images: string[]) => (text.trim().length > 0 ? text : images.length > 0 ? '[图片]' : '');

/** 渲染阶段 4 的最小侧边栏工作台。 */
export const SidebarShell = ({ api, tabId, pageUrl }: SidebarShellProps) => {
  const [state, setState] = useState<SidebarState>('bootstrapping');
  const [content, setContent] = useState('');
  const [method, setMethod] = useState<ExtractionMethod>('readability');
  const [messages, setMessages] = useState<ChatMessageState[]>([]);
  const [restoreMessageId, setRestoreMessageId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [includePageContentByDefault, setIncludePageContentByDefault] = useState(true);
  const [chatNotice, setChatNotice] = useState('');

  /** 执行一次正文提取并同步 UI 状态。 */
  const runExtraction = async (nextMethod: ExtractionMethod) => {
    setState('extracting');
    const extraction = await api.reExtractContent({
      tabId,
      pageUrl,
      method: nextMethod,
    });
    setContent(extraction.payload.content);
    setMethod(extraction.payload.extractionMethod);
    setState('ready');
  };

  useEffect(() => {
    const port = api.connectStream({
      tabId,
      pageUrl,
      promptTabId: CHAT_PROMPT_TAB_ID,
    });
    const handlePortMessage = (event: unknown) => {
      if (typeof event !== 'object' || event === null || !('type' in event)) {
        return;
      }

      const payload = event as Record<string, unknown>;
      switch (payload.type) {
        case 'CHAT_STREAM_STARTED':
          if (typeof payload.sessionId === 'string') {
            setActiveSessionId(payload.sessionId);
          }
          if (typeof payload.messageId === 'string') {
            setRestoreMessageId(payload.messageId);
            setMessages((current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: 'loading',
              })),
            );
          }
          return;
        case 'CHAT_STREAM_CHUNK':
          if (typeof payload.sessionId === 'string') {
            setActiveSessionId(payload.sessionId);
          }
          if (typeof payload.messageId === 'string' && typeof payload.chunk === 'string') {
            setRestoreMessageId(payload.messageId);
            setMessages((current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: `${message?.content ?? ''}${payload.chunk as string}`,
                status: 'loading',
              })),
            );
          }
          return;
        case 'CHAT_STREAM_FINISHED':
          setActiveSessionId(null);
          setRestoreMessageId(null);
          if (typeof payload.messageId === 'string') {
            setMessages((current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: 'done',
              })),
            );
          }
          return;
        case 'CHAT_STREAM_FAILED':
          setActiveSessionId(null);
          setRestoreMessageId(null);
          if (typeof payload.messageId === 'string') {
            setMessages((current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: 'error',
              })),
            );
          }
          return;
        case 'CHAT_STREAM_CANCELLED':
          setActiveSessionId(null);
          setRestoreMessageId(null);
          if (typeof payload.messageId === 'string') {
            setMessages((current) =>
              upsertAssistantMessage(current, payload.messageId as string, (message) => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: message?.content ?? '',
                status: 'cancelled',
              })),
            );
          }
          return;
        case 'RESTORE_LOADING':
          if (typeof payload.sessionId === 'string') {
            setActiveSessionId(payload.sessionId);
          }
          if (typeof payload.messageId === 'string' && typeof payload.content === 'string') {
            setRestoreMessageId(payload.messageId);
            setMessages((current) =>
              upsertAssistantMessage(current, payload.messageId as string, () => ({
                id: payload.messageId as string,
                role: 'assistant',
                content: payload.content as string,
                status: 'loading',
              })),
            );
          }
          return;
        default:
          return;
      }
    };

    port.onMessage?.addListener?.(handlePortMessage as never);
    return () => {
      port.onMessage?.removeListener?.(handlePortMessage as never);
      port.disconnect();
    };
  }, [api, pageUrl, tabId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [bootstrap, configResponse] = await Promise.all([api.getSidebarBootstrap({ tabId, pageUrl }), api.getConfig()]);
        if (cancelled) {
          return;
        }

        const nextMethod = bootstrap.page?.extractionMethod ?? 'readability';
        const nextModels = getEnabledCompleteModels(configResponse.config).map((model) => ({
          id: model.id,
          name: model.name,
          supportsImages: model.supportsImages,
        }));
        const defaultModelId =
          nextModels.find((model) => model.id === configResponse.config.basic.defaultModelId)?.id ?? nextModels[0]?.id ?? '';
        const chatConversation = bootstrap.conversations.find((conversation) => conversation.promptTabId === CHAT_PROMPT_TAB_ID) ?? null;
        const chatLoadingState = bootstrap.loadingStates.find((loadingState) => loadingState.promptTabId === CHAT_PROMPT_TAB_ID) ?? null;
        const loadingAssistantMessage =
          chatConversation?.messages.find((message) => message.role === 'assistant' && message.status === 'loading') ?? null;

        setMethod(nextMethod);
        setContent(bootstrap.page?.content ?? '');
        setModels(nextModels);
        setSelectedModelId(defaultModelId);
        setIncludePageContentByDefault(configResponse.config.basic.includePageContentByDefault);
        setMessages(
          (chatConversation?.messages ?? []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            status: message.status,
          })),
        );
        setRestoreMessageId(chatLoadingState?.resumeTarget?.messageId ?? loadingAssistantMessage?.id ?? null);
        setActiveSessionId(chatLoadingState?.sessionId ?? null);

        if (bootstrap.blockedByBlacklist) {
          setState('blocked');
          return;
        }

        if (!bootstrap.shouldExtract) {
          setState('ready');
          return;
        }

        setState('extracting');
        const extraction = await api.reExtractContent({ tabId, pageUrl, method: nextMethod });
        if (cancelled) {
          return;
        }

        setContent(extraction.payload.content);
        setMethod(extraction.payload.extractionMethod);
        setState('ready');
      } catch {
        if (!cancelled) {
          setState('error');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api, pageUrl, tabId]);

  /** 黑名单放行后继续当前页面提取。 */
  const handleConfirmContinue = async () => {
    await api.confirmBlacklistContinue({ tabId, pageUrl });
    try {
      await runExtraction(method);
    } catch {
      setState('error');
    }
  };

  /** 切换提取方式并立即重新提取。 */
  const handleSwitchMethod = async (nextMethod: ExtractionMethod) => {
    if (nextMethod === method || state === 'bootstrapping' || state === 'blocked') {
      return;
    }

    try {
      await api.switchExtractionMethod({ tabId, pageUrl, method: nextMethod });
      await runExtraction(nextMethod);
    } catch {
      setState('error');
    }
  };

  /** 发送用户消息，并在本地先补一条乐观消息。 */
  const handleSend = async (input: { text: string; images: string[]; modelId: string; includePageContent: boolean }) => {
    setChatNotice('');
    const optimisticUserMessageId = `local-user:${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: optimisticUserMessageId,
        role: 'user',
        content: toOptimisticUserContent(input.text, input.images),
        status: 'done',
      },
    ]);

    try {
      const response = await api.sendChat({
        tabId,
        pageUrl,
        promptTabId: CHAT_PROMPT_TAB_ID,
        modelId: input.modelId,
        text: input.text,
        images: input.images,
        includePageContent: input.includePageContent,
      });
      setActiveSessionId(response.payload.sessionId);
      setRestoreMessageId(response.payload.messageId);
      setMessages((current) =>
        upsertAssistantMessage(current, response.payload.messageId, (message) => ({
          id: response.payload.messageId,
          role: 'assistant',
          content: message?.content ?? '',
          status: 'loading',
        })),
      );
    } catch {
      setChatNotice('发送失败，请重试');
    }
  };

  /** 停止当前会话。 */
  const handleStop = async () => {
    if (!activeSessionId) {
      return;
    }

    await api.stopSession({
      tabId,
      pageUrl,
      promptTabId: CHAT_PROMPT_TAB_ID,
      sessionId: activeSessionId,
    });
  };

  /** 导出当前会话，空会话时直接拦截。 */
  const handleExport = async () => {
    const hasExportableMessage = messages.some((message) => message.content.trim().length > 0);
    if (!hasExportableMessage) {
      setChatNotice('当前会话为空，不能导出');
      return;
    }

    setChatNotice('');
    await api.exportConversation({
      tabId,
      pageUrl,
      promptTabId: CHAT_PROMPT_TAB_ID,
    });
  };

  return (
    <main data-testid="sidebar-shell" className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <button type="button" aria-pressed={method === 'readability'} onClick={() => void handleSwitchMethod('readability')}>
              Readability
            </button>
            <button type="button" aria-pressed={method === 'jina'} onClick={() => void handleSwitchMethod('jina')}>
              Jina
            </button>
          </div>
          <span className="text-xs text-muted-foreground">browserTab #{tabId}</span>
        </div>
      </header>

      <section data-testid="sidebar-extraction-panel" className="min-h-48 border-b border-border px-4 py-3">
        {state === 'bootstrapping' ? <p>正在恢复页面上下文…</p> : null}
        {state === 'blocked' ? (
          <div className="space-y-3">
            <p>当前页面命中黑名单</p>
            <p>等待放行</p>
            <button type="button" onClick={() => void handleConfirmContinue()}>
              继续提取
            </button>
          </div>
        ) : null}
        {state === 'extracting' ? <p>正在提取页面正文…</p> : null}
        {state === 'error' ? <p>提取失败，请重试。</p> : null}
        {content ? <article className="whitespace-pre-wrap">{content}</article> : null}
      </section>

      <section className="border-b border-border px-4 py-2">
        <button role="tab" aria-selected="true" type="button">
          Chat
        </button>
      </section>

      <ChatThread messages={messages} restoreMessageId={restoreMessageId} />
      <ChatInput
        disabled={state === 'bootstrapping' || state === 'extracting' || state === 'blocked'}
        sending={Boolean(activeSessionId)}
        selectedModelId={selectedModelId}
        models={models}
        defaultIncludePageContent={includePageContentByDefault}
        onSelectModel={setSelectedModelId}
        onSend={handleSend}
        onStop={handleStop}
        onExport={handleExport}
      />
      {chatNotice ? <p className="px-4 pb-3 text-sm text-destructive">{chatNotice}</p> : null}
    </main>
  );
};
