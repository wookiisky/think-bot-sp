import { describe, expect, it } from 'vitest';

import {
  buildPageRecord,
  normalizePageUrl,
  pageRecordSchema,
  resetPromptTabState,
  updatePromptTabState,
} from '../../../src/domain/page/page-schema';

describe('page schema', () => {
  it('归一化页面 URL', () => {
    expect(normalizePageUrl('https://example.com/a?utm_source=ads&q=1#hash')).toBe(
      'https://example.com/a?q=1',
    );
  });

  it('归一化微信文章 URL 时删除临时令牌并保留文章标识参数', () => {
    expect(
      normalizePageUrl(
        'https://mp.weixin.qq.com/s?__biz=MzE5ODg1MTY4Mw==&mid=2247484903&idx=1&sn=b6bdb775de8455680a7f70dd21de9df1&poc_token=HGk0GWqjXLXFsTIuw9rKI7Q0qZy8ifq4KP-lOpWp',
      ),
    ).toBe(
      'https://mp.weixin.qq.com/s?__biz=MzE5ODg1MTY4Mw%3D%3D&mid=2247484903&idx=1&sn=b6bdb775de8455680a7f70dd21de9df1',
    );
  });

  it('归一化其他域名 URL 时不删除同名参数', () => {
    expect(normalizePageUrl('https://example.com/a?poc_token=keep&q=1')).toBe(
      'https://example.com/a?poc_token=keep&q=1',
    );
  });

  it('创建页面记录时默认开启页面内容并写入过期时间', () => {
    const page = buildPageRecord({
      url: 'https://example.com/a?utm_source=ads&q=1#hash',
      now: 1_000,
    });

    expect(pageRecordSchema.parse(page)).toEqual(page);
    expect(page.id).toBe('https://example.com/a?q=1');
    expect(page.includePageContent).toBe(true);
    expect(page.promptTabStates).toEqual([]);
    expect(page.expiresAt - page.updatedAt).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('重置 promptTab 时只清空目标状态', () => {
    const page = buildPageRecord({
      url: 'https://example.com',
      promptTabStates: [
        {
          promptTabId: 'chat',
          initializedAt: 10,
          lastAutoTriggerAt: 20,
          autoTriggerStatus: 'running',
          lastClearedAt: null,
        },
        {
          promptTabId: 'quick',
          initializedAt: 30,
          lastAutoTriggerAt: 40,
          autoTriggerStatus: 'done',
          lastClearedAt: null,
        },
      ],
      now: 50,
    });

    const next = resetPromptTabState(page, 'chat', 60);

    expect(next.includePageContent).toBe(true);
    expect(next.promptTabStates[0]).toEqual({
      promptTabId: 'chat',
      initializedAt: null,
      lastAutoTriggerAt: null,
      autoTriggerStatus: 'idle',
      lastClearedAt: 60,
    });
    expect(next.promptTabStates[1]).toEqual(page.promptTabStates[1]);
  });

  it('更新 promptTab 运行态时会保留其他页面字段并按需补新标签', () => {
    const page = buildPageRecord({
      url: 'https://example.com',
      promptTabStates: [
        {
          promptTabId: 'chat',
          initializedAt: 10,
          lastAutoTriggerAt: null,
          autoTriggerStatus: 'idle',
          lastClearedAt: null,
        },
      ],
      now: 50,
    });

    const next = updatePromptTabState(
      page,
      {
        promptTabId: 'quick-1',
        initializedAt: 60,
        lastAutoTriggerAt: 60,
        autoTriggerStatus: 'running',
      },
      70,
    );

    expect(next.includePageContent).toBe(true);
    expect(next.promptTabStates).toEqual([
      {
        promptTabId: 'chat',
        initializedAt: 10,
        lastAutoTriggerAt: null,
        autoTriggerStatus: 'idle',
        lastClearedAt: null,
      },
      {
        promptTabId: 'quick-1',
        initializedAt: 60,
        lastAutoTriggerAt: 60,
        autoTriggerStatus: 'running',
        lastClearedAt: null,
      },
    ]);
  });
});
