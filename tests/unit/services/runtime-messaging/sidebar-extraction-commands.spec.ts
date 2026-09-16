import { describe, expect, it, vi } from 'vitest';

import { createSidebarCommandHandler } from '../../../../src/services/runtime-messaging/sidebar-commands';
import { createSidebarSessionRegistry } from '../../../../src/services/runtime-messaging/sidebar-session-registry';

const sidebarSender = { id: 'ext-id', url: 'chrome-extension://ext-id/sidebar.html' };
const conversationsSender = { id: 'ext-id', url: 'chrome-extension://ext-id/conversations.html' };
const pageUrl = 'https://example.com/article?utm_source=newsletter#details';
const normalizedUrl = 'https://example.com/article';

const createFixture = () => {
  const extractionResult = {
    normalizedUrl,
    url: 'https://example.com/article',
    title: '示例页面',
    faviconUrl: '',
    content: '页面正文',
    extractionMethod: 'readability' as const,
  };
  const extractPage = vi.fn().mockResolvedValue(extractionResult);
  const grant = vi.fn().mockResolvedValue(undefined);
  const handleExtractionCompleted = vi.fn().mockResolvedValue(undefined);
  const selectExtractionCache = vi.fn();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const extractionLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const handler = createSidebarCommandHandler({
    runtime: { id: 'ext-id' },
    pageRepository: { getPage: vi.fn().mockResolvedValue(null), selectExtractionCache },
    conversationRepository: {
      listPageConversations: vi.fn().mockResolvedValue([]),
      listPageLoadingStates: vi.fn().mockResolvedValue([]),
    },
    blacklistRepository: { isBlocked: () => false, getMatchedRuleId: () => null },
    sessionRegistry: createSidebarSessionRegistry(),
    logger,
    extractionLogger,
    extractionService: { extractPage },
    blacklistBypass: { grant },
    autoTrigger: { handleExtractionCompleted },
    now: () => 1000,
  });
  return { handler, extractPage, extractionResult, grant, handleExtractionCompleted, selectExtractionCache, logger, extractionLogger };
};

/** 让 fire-and-forget 的自动触发有机会执行。 */
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('sidebar extraction commands go through the shared handler', () => {
  it('CONFIRM_BLACKLIST_CONTINUE 按归一化 URL 发放放行令牌', async () => {
    const { handler, grant, logger } = createFixture();
    await expect(
      handler({ type: 'CONFIRM_BLACKLIST_CONTINUE', tabId: 7, pageUrl }, { sender: sidebarSender }),
    ).resolves.toEqual({ type: 'CONFIRM_BLACKLIST_CONTINUE_SUCCESS', payload: { allowed: true } });
    expect(grant).toHaveBeenCalledWith(7, normalizedUrl);
    expect(logger.info).toHaveBeenCalledWith('blacklist.bypass_confirmed', { browserTabId: 7, normalizedUrl });
  });

  it.each([
    ['CONFIRM_BLACKLIST_CONTINUE', { type: 'CONFIRM_BLACKLIST_CONTINUE', tabId: 7, pageUrl }],
    ['RE_EXTRACT_CONTENT', { type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'readability', source: 'panel_bootstrap' }],
    ['SWITCH_EXTRACTION_METHOD', { type: 'SWITCH_EXTRACTION_METHOD', tabId: 7, pageUrl, method: 'jina' }],
  ] as const)('%s 拒绝非 side panel sender，且不产生副作用', async (_type, command) => {
    const { handler, grant, extractPage, selectExtractionCache } = createFixture();
    await expect(handler(command, { sender: conversationsSender })).rejects.toThrow('invalid sidebar sender');
    expect(grant).not.toHaveBeenCalled();
    expect(extractPage).not.toHaveBeenCalled();
    expect(selectExtractionCache).not.toHaveBeenCalled();
  });

  it('畸形 payload 以 rejected promise 返回，而不是同步抛出', async () => {
    const { handler } = createFixture();
    const result = handler({ type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'bogus', source: 'panel_bootstrap' }, { sender: sidebarSender });
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow();
  });

  it.each(['panel_bootstrap', 'blacklist_continue'] as const)('RE_EXTRACT_CONTENT 来源 %s 成功后编排自动触发', async (source) => {
    const { handler, extractPage, extractionResult, handleExtractionCompleted, extractionLogger } = createFixture();
    await expect(
      handler({ type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'readability', source }, { sender: sidebarSender }),
    ).resolves.toEqual({ type: 'RE_EXTRACT_CONTENT_SUCCESS', payload: extractionResult });
    expect(extractPage).toHaveBeenCalledWith({ tabId: 7, pageUrl, method: 'readability' });
    await flushMicrotasks();
    expect(handleExtractionCompleted).toHaveBeenCalledWith({
      browserTabId: 7,
      pageUrl: extractionResult.url,
      normalizedUrl,
      pageContent: '页面正文',
    });
    expect(extractionLogger.info).toHaveBeenCalledWith('extraction.completed', expect.objectContaining({
      browserTabId: 7,
      normalizedUrl,
      method: 'readability',
      source,
      contentLength: 4,
      autoTrigger: true,
    }));
  });

  it.each(['manual_reextract', 'prompt_tab_click'] as const)('RE_EXTRACT_CONTENT 来源 %s 不触发自动触发', async (source) => {
    const { handler, handleExtractionCompleted } = createFixture();
    await handler({ type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'jina', source }, { sender: sidebarSender });
    await flushMicrotasks();
    expect(handleExtractionCompleted).not.toHaveBeenCalled();
  });

  it('自动触发编排失败只记日志，不影响已返回的提取结果', async () => {
    const { handler, handleExtractionCompleted, logger } = createFixture();
    handleExtractionCompleted.mockRejectedValue(new Error('auto trigger exploded'));
    await expect(
      handler({ type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'readability', source: 'panel_bootstrap' }, { sender: sidebarSender }),
    ).resolves.toMatchObject({ type: 'RE_EXTRACT_CONTENT_SUCCESS' });
    await flushMicrotasks();
    expect(logger.error).toHaveBeenCalledWith('auto_trigger.unhandled', expect.objectContaining({ reason: 'auto trigger exploded' }));
  });

  it('RE_EXTRACT_CONTENT 提取失败会记录 extraction.failed 并向上抛出', async () => {
    const { handler, extractPage, extractionLogger, handleExtractionCompleted } = createFixture();
    extractPage.mockRejectedValue(new Error('tab unreachable'));
    await expect(
      handler({ type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'readability', source: 'panel_bootstrap' }, { sender: sidebarSender }),
    ).rejects.toThrow('tab unreachable');
    expect(extractionLogger.error).toHaveBeenCalledWith('extraction.failed', expect.objectContaining({
      browserTabId: 7,
      normalizedUrl,
      method: 'readability',
      source: 'panel_bootstrap',
      reason: 'tab unreachable',
    }));
    expect(handleExtractionCompleted).not.toHaveBeenCalled();
  });

  it('SWITCH_EXTRACTION_METHOD 命中缓存时返回正文，未命中时只返回方法', async () => {
    const { handler, selectExtractionCache, extractionLogger } = createFixture();
    selectExtractionCache.mockResolvedValueOnce({ hasCachedContent: true, page: null, content: '缓存正文', extractionMethod: 'jina' });
    await expect(
      handler({ type: 'SWITCH_EXTRACTION_METHOD', tabId: 7, pageUrl, method: 'jina' }, { sender: sidebarSender }),
    ).resolves.toEqual({
      type: 'SWITCH_EXTRACTION_METHOD_SUCCESS',
      payload: { hasCachedContent: true, method: 'jina', content: '缓存正文', extractionMethod: 'jina' },
    });
    expect(selectExtractionCache).toHaveBeenCalledWith({ normalizedUrl, method: 'jina' });
    expect(extractionLogger.info).toHaveBeenCalledWith('extraction.method_switched', expect.objectContaining({ method: 'jina', hasCachedContent: true }));

    selectExtractionCache.mockResolvedValueOnce({ hasCachedContent: false, page: null });
    await expect(
      handler({ type: 'SWITCH_EXTRACTION_METHOD', tabId: 7, pageUrl, method: 'readability' }, { sender: sidebarSender }),
    ).resolves.toEqual({
      type: 'SWITCH_EXTRACTION_METHOD_SUCCESS',
      payload: { hasCachedContent: false, method: 'readability' },
    });
  });

  it('缺少提取相关依赖时按 unsupported command 拒绝', async () => {
    const handler = createSidebarCommandHandler({
      runtime: { id: 'ext-id' },
      pageRepository: { getPage: vi.fn().mockResolvedValue(null) },
      conversationRepository: {
        listPageConversations: vi.fn().mockResolvedValue([]),
        listPageLoadingStates: vi.fn().mockResolvedValue([]),
      },
      blacklistRepository: { isBlocked: () => false, getMatchedRuleId: () => null },
      sessionRegistry: createSidebarSessionRegistry(),
    });
    await expect(handler({ type: 'CONFIRM_BLACKLIST_CONTINUE', tabId: 7, pageUrl }, { sender: sidebarSender })).rejects.toThrow('unsupported command: CONFIRM_BLACKLIST_CONTINUE');
    await expect(handler({ type: 'RE_EXTRACT_CONTENT', tabId: 7, pageUrl, method: 'readability', source: 'panel_bootstrap' }, { sender: sidebarSender })).rejects.toThrow('unsupported command: RE_EXTRACT_CONTENT');
    await expect(handler({ type: 'SWITCH_EXTRACTION_METHOD', tabId: 7, pageUrl, method: 'jina' }, { sender: sidebarSender })).rejects.toThrow('unsupported command: SWITCH_EXTRACTION_METHOD');
  });
});
