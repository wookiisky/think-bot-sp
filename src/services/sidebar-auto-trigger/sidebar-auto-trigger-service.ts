import { getEnabledCompleteModels, type ExtensionConfig } from '../../domain/config/config-schema';
import { describeError, type Logger } from '../logger/logger';
import type { createSidebarSessionRegistry, SidebarSession } from '../runtime-messaging/sidebar-session-registry';

/** debug 可选，兼容只提供三档的测试夹具。 */
type AutoTriggerLogger = Pick<Logger, 'info' | 'warn' | 'error'> & Partial<Pick<Logger, 'debug'>>;

type AutoTriggerSession = {
  /** 自动创建的附加分支，与整轮协调器一起注册。 */
  branchSessions: Array<SidebarSession & { branchId: string }>;
  /** 本次流式会话 id。 */
  sessionId: string;
  /** 当前助手消息 id。 */
  messageId: string;
  /** 主动取消当前会话。 */
  cancel: () => void;
  /** 会话完成 promise。 */
  done: Promise<{
    /** 本次流式会话 id。 */
    sessionId: string;
    /** 助手消息 id。 */
    messageId: string;
    /** 最终状态。 */
    status: 'done' | 'error' | 'cancelled';
    /** 错误消息。 */
    errorMessage: string | null;
    /** 当前结果是否仍然保留在持久层。 */
    persisted: boolean;
  }>;
};

type SidebarAutoTriggerDeps = {
  /** 结构化日志。 */
  logger: AutoTriggerLogger;
  /** 配置仓储。 */
  configRepository: {
    /** 读取完整配置。 */
    getConfig: () => Promise<ExtensionConfig>;
  };
  /** 页面仓储。 */
  pageRepository: {
    /** 读取页面记录。 */
    getPage: (_normalizedUrl: string) => Promise<{
      promptTabStates: Array<{
        promptTabId: string;
        initializedAt: number | null;
        lastAutoTriggerAt: number | null;
        autoTriggerStatus: 'idle' | 'queued' | 'running' | 'done' | 'error';
        lastClearedAt: number | null;
      }>;
    } | null>;
    /** 强制打开页面级正文开关。 */
    setIncludePageContent?: (_input: {
      normalizedUrl: string;
      url: string;
      includePageContent: boolean;
    }) => Promise<unknown>;
    /** 更新页面级 promptTab 运行态。 */
    setPromptTabState: (_input: {
      normalizedUrl: string;
      url: string;
      promptTabId: string;
      initializedAt?: number | null;
      lastAutoTriggerAt?: number | null;
      autoTriggerStatus?: 'idle' | 'queued' | 'running' | 'done' | 'error';
      lastClearedAt?: number | null;
    }) => Promise<unknown>;
  };
  /** 会话仓储。 */
  conversationRepository: {
    /** 读取目标 promptTab 会话。 */
    getConversation: (_normalizedUrl: string, _promptTabId: string) => Promise<{
      messages: Array<unknown>;
    } | null>;
    /** 读取目标 promptTab loading。 */
    getLoadingState: (_normalizedUrl: string, _promptTabId: string) => Promise<{
      promptTabStatus: 'idle' | 'loading' | 'cancelled' | 'error';
    } | null>;
  };
  /** 主聊天流调度服务。 */
  chatDispatchService: {
    /** 发起主聊天流。 */
    dispatchChat: (_input: {
      normalizedUrl: string;
      promptTabId: string;
      modelId: string;
      content: string;
      displayText?: string;
      images: string[];
      pageContent: string;
      rollbackOnFailure?: boolean;
    }) => Promise<AutoTriggerSession>;
  };
  /** 活跃会话注册表。 */
  sessionRegistry: Pick<ReturnType<typeof createSidebarSessionRegistry>, 'registerTurn'>;
  /** 当前时间。 */
  now?: () => number;
};

/** 解析自动触发要使用的模型 id。 */
const resolveAutoTriggerModelId = (config: ExtensionConfig, preferredModelId: string | null): string | null => {
  const enabledModels = getEnabledCompleteModels(config);
  if (preferredModelId && enabledModels.some((model) => model.id === preferredModelId)) {
    return preferredModelId;
  }

  return enabledModels.find((model) => model.id === config.basic.defaultModelId)?.id ?? enabledModels[0]?.id ?? null;
};

/** 侧边栏提取完成后的自动触发编排。 */
export const createSidebarAutoTriggerService = (deps: SidebarAutoTriggerDeps) => {
  const now = deps.now ?? (() => Date.now());

  return {
    /** 页面提取完成后，按规则自动触发快捷输入。 */
    async handleExtractionCompleted(input: {
      /** 浏览器标签页 id。 */
      browserTabId: number;
      /** 页面原始 URL。 */
      pageUrl: string;
      /** 页面归一化 URL。 */
      normalizedUrl: string;
      /** 当前提取出来的正文。 */
      pageContent: string;
    }) {
      if (!input.pageContent.trim()) {
        deps.logger.info('auto_trigger.skipped', {
          browserTabId: input.browserTabId,
          normalizedUrl: input.normalizedUrl,
          reason: 'empty_page_content',
        });
        return;
      }

      const config = await deps.configRepository.getConfig();
      const candidates = config.quickInputs
        .filter((item) => item.deletedAt === null && item.autoTrigger)
        .sort((left, right) => left.order - right.order);
      deps.logger.debug?.('auto_trigger.evaluated', {
        browserTabId: input.browserTabId,
        normalizedUrl: input.normalizedUrl,
        candidateCount: candidates.length,
        pageContentLength: input.pageContent.length,
      });

      for (const quickInput of candidates) {
        const [conversation, loadingState] = await Promise.all([
          deps.conversationRepository.getConversation(input.normalizedUrl, quickInput.id),
          deps.conversationRepository.getLoadingState(input.normalizedUrl, quickInput.id),
        ]);

        if ((conversation?.messages.length ?? 0) > 0) {
          deps.logger.debug?.('auto_trigger.skipped', {
            browserTabId: input.browserTabId,
            normalizedUrl: input.normalizedUrl,
            promptTab: quickInput.id,
            reason: 'has_conversation',
          });
          continue;
        }
        if (loadingState?.promptTabStatus === 'loading') {
          deps.logger.debug?.('auto_trigger.skipped', {
            browserTabId: input.browserTabId,
            normalizedUrl: input.normalizedUrl,
            promptTab: quickInput.id,
            reason: 'loading_exists',
          });
          continue;
        }
        const modelId = resolveAutoTriggerModelId(config, quickInput.modelId);
        if (!modelId) {
          deps.logger.warn('auto_trigger.skipped', {
            browserTabId: input.browserTabId,
            normalizedUrl: input.normalizedUrl,
            promptTab: quickInput.id,
            reason: 'no_available_model',
          });
          continue;
        }

        const triggerAt = now();
        // 标记 running 之后的任何失败都必须回退为 idle，所以前置写入也放进同一个 try。
        let markedRunning = false;
        try {
          await deps.pageRepository.setIncludePageContent?.({
            normalizedUrl: input.normalizedUrl,
            url: input.pageUrl,
            includePageContent: true,
          });
          await deps.pageRepository.setPromptTabState({
            normalizedUrl: input.normalizedUrl,
            url: input.pageUrl,
            promptTabId: quickInput.id,
            initializedAt: triggerAt,
            lastAutoTriggerAt: triggerAt,
            autoTriggerStatus: 'running',
          });
          markedRunning = true;
          const session = await deps.chatDispatchService.dispatchChat({
            normalizedUrl: input.normalizedUrl,
            promptTabId: quickInput.id,
            modelId,
            content: quickInput.prompt,
            displayText: quickInput.name,
            images: [],
            pageContent: input.pageContent,
            rollbackOnFailure: true,
          });
          deps.sessionRegistry.registerTurn({
            coordinator: session,
            branchSessions: session.branchSessions,
            scope: { normalizedUrl: input.normalizedUrl, promptTabId: quickInput.id },
          });
          deps.logger.info('auto_trigger.started', {
            browserTabId: input.browserTabId,
            normalizedUrl: input.normalizedUrl,
            promptTab: quickInput.id,
            sessionId: session.sessionId,
            messageId: session.messageId,
            modelId,
          });

          void session.done
            .then(async (result) => {
              const latestPage = await deps.pageRepository.getPage(input.normalizedUrl);
              const latestPromptTabState = latestPage?.promptTabStates.find((item) => item.promptTabId === quickInput.id) ?? null;
              if (!latestPage) {
                return;
              }
              if (
                typeof latestPromptTabState?.lastClearedAt === 'number'
                && latestPromptTabState.lastClearedAt >= triggerAt
              ) {
                return;
              }

              await deps.pageRepository.setPromptTabState({
                normalizedUrl: input.normalizedUrl,
                url: input.pageUrl,
                promptTabId: quickInput.id,
                autoTriggerStatus:
                  result.status === 'done'
                    ? 'done'
                    : result.status === 'error'
                      ? result.persisted
                        ? 'error'
                        : 'idle'
                      : 'idle',
              });
            })
            .catch((error: unknown) => {
              deps.logger.warn('auto_trigger.finalize_failed', {
                browserTabId: input.browserTabId,
                normalizedUrl: input.normalizedUrl,
                promptTab: quickInput.id,
                sessionId: session.sessionId,
                reason: describeError(error),
              });
            });
        } catch (error: unknown) {
          const reason = describeError(error);
          if (markedRunning) {
            try {
              await deps.pageRepository.setPromptTabState({
                normalizedUrl: input.normalizedUrl,
                url: input.pageUrl,
                promptTabId: quickInput.id,
                autoTriggerStatus: 'idle',
              });
            } catch (resetError: unknown) {
              deps.logger.warn('auto_trigger.reset_failed', {
                browserTabId: input.browserTabId,
                normalizedUrl: input.normalizedUrl,
                promptTab: quickInput.id,
                reason: describeError(resetError),
              });
            }
          }
          deps.logger.error('auto_trigger.failed', {
            browserTabId: input.browserTabId,
            normalizedUrl: input.normalizedUrl,
            promptTab: quickInput.id,
            modelId,
            reason,
          });
        }
      }
    },
  };
};
