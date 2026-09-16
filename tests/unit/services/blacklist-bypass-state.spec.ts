import { describe, expect, it } from 'vitest';

import { createBlacklistBypassState } from '../../../src/services/blacklist/blacklist-bypass-state';
import { createFakeStorageArea } from '../../helpers/fake-storage';

const url = 'https://example.com/article';

describe('blacklist-bypass-state', () => {
  it('放行令牌写入 storage，重新创建实例后仍然可读（模拟 service worker 重启）', async () => {
    const storage = createFakeStorageArea();
    const first = createBlacklistBypassState(storage, () => 100);
    await first.grant(7, url);
    await expect(first.has(7, url)).resolves.toBe(true);

    const restarted = createBlacklistBypassState(storage);
    await expect(restarted.has(7, url)).resolves.toBe(true);
    await expect(restarted.has(8, url)).resolves.toBe(false);
    await expect(restarted.has(7, 'https://example.com/other')).resolves.toBe(false);
    expect(storage.dump()).toEqual({ blacklistBypass: { [`7:${url}`]: 100 } });
  });

  it('clearTab 只清理目标标签页，retainOnlyTab 只保留目标标签页', async () => {
    const state = createBlacklistBypassState(createFakeStorageArea());
    await Promise.all([state.grant(1, url), state.grant(2, url), state.grant(3, url)]);

    await state.clearTab(2);
    await expect(state.has(1, url)).resolves.toBe(true);
    await expect(state.has(2, url)).resolves.toBe(false);
    await expect(state.has(3, url)).resolves.toBe(true);

    await state.retainOnlyTab(3);
    await expect(state.has(1, url)).resolves.toBe(false);
    await expect(state.has(3, url)).resolves.toBe(true);
  });

  it('并发 grant 不会互相覆盖', async () => {
    const state = createBlacklistBypassState(createFakeStorageArea());
    await Promise.all(Array.from({ length: 5 }, (_, index) => state.grant(index + 1, url)));
    for (let tabId = 1; tabId <= 5; tabId += 1) {
      await expect(state.has(tabId, url)).resolves.toBe(true);
    }
  });

  it('损坏的存储内容视为空表', async () => {
    const storage = createFakeStorageArea();
    await storage.set({ blacklistBypass: ['not', 'a', 'map'] });
    const state = createBlacklistBypassState(storage);
    await expect(state.has(1, url)).resolves.toBe(false);
    await storage.set({ blacklistBypass: { [`1:${url}`]: 'bad', [`2:${url}`]: 5 } });
    await expect(state.has(1, url)).resolves.toBe(false);
    await expect(state.has(2, url)).resolves.toBe(true);
  });
});
