import { describe, expect, it, vi } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createSyncRepository } from '../../../src/repositories/sync-repository';
import { createLocaleRepository } from '../../../src/repositories/locale-repository';
import { createSyncService } from '../../../src/services/sync/sync-service';
import { createFakeStorageArea } from '../../helpers/fake-storage';
import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createGistSyncProvider } from '../../../src/services/sync/gist-sync-provider';
import { createWebdavSyncProvider } from '../../../src/services/sync/webdav-sync-provider';

/** 将文案键和变量保留为可观测输出，验证 provider 不自行硬编码业务文案。 */
const translate = (key: string, values?: Record<string, string | number>) => `${key}:${JSON.stringify(values ?? {})}`;
const sync = createDefaultConfig({ sync: { enabled: true, provider: 'gist', gistToken: 'token', gistId: 'id', webdavUrl: 'https://example.com/sync' } }).sync;

describe.each([
  { name: 'gist', create: createGistSyncProvider },
  { name: 'webdav', create: createWebdavSyncProvider },
])('sync provider $name 文案边界', ({ name, create }) => {
  it('连接成功和鉴权失败通过传入的翻译器生成', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 200 })).mockResolvedValueOnce(new Response('', { status: 401 }));
    const provider = create(fetchImpl, translate);
    await expect(provider.testConnection(sync)).resolves.toMatchObject({ message: translate(`sync.message.${name}Connected`) });
    await expect(provider.readSnapshot(sync)).rejects.toThrow(translate(`sync.message.${name}AuthFailed`));
  });

  it('HTTP 状态码作为变量传入翻译器', async () => {
    const provider = create(vi.fn().mockResolvedValue(new Response('', { status: 503 })), translate);
    await expect(provider.testConnection(sync)).rejects.toThrow(translate(`sync.message.${name}ConnectionFailed`, { status: 503 }));
    await expect(provider.readSnapshot(sync)).rejects.toThrow(translate(`sync.message.${name}ReadFailed`, { status: 503 }));
  });

  it('网络原始错误保持原样', async () => {
    const error = new Error('transport detail');
    const provider = create(vi.fn().mockRejectedValue(error), translate);
    await expect(provider.testConnection(sync)).rejects.toBe(error);
  });

  it('非法远端快照通过翻译器报告', async () => {
    const body = name === 'gist' ? JSON.stringify({ files: { 'think-bot-sp-sync.json': { content: '{}' } } }) : '{}';
    const provider = create(vi.fn().mockResolvedValue(new Response(body, { status: 200 })), translate);
    await expect(provider.readSnapshot(sync)).rejects.toThrow(translate(`sync.message.${name}InvalidSnapshot`));
  });
});


describe('sync-service 语言传递', () => {
  it('连接测试每次使用本次指定的语言，旧调用默认中文', async () => {
    const service = createSyncService({
      syncRepository: createSyncRepository({ storage: createChromeLocalAdapter(createFakeStorageArea()) }),
      fetchImpl: vi.fn().mockImplementation(async () => new Response('', { status: 200 })),
    });
    const resources = createLocaleRepository().loadResources();
    const [english, chinese] = await Promise.all([service.testConnection(sync, 'en'), service.testConnection(sync)]);
    expect(english.message).toBe(resources.t('sync.message.gistConnected', 'en'));
    expect(chinese.message).toBe(resources.t('sync.message.gistConnected', 'zh-CN'));
  });

  it('同步使用调用配置的语言报告错误，未启用时不访问网络', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const service = createSyncService({
      syncRepository: createSyncRepository({ storage: createChromeLocalAdapter(createFakeStorageArea()) }),
      fetchImpl,
    });
    const resources = createLocaleRepository().loadResources();
    await expect(service.syncNow(createDefaultConfig({ basic: { language: 'en' } }))).rejects.toThrow(resources.t('sync.message.disabled', 'en'));
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(service.syncNow(createDefaultConfig({ basic: { language: 'en' }, sync }))).rejects.toThrow(resources.t('sync.message.gistAuthFailed', 'en'));
  });
});
