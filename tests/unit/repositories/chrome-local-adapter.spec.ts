import { describe, expect, it, vi } from 'vitest';

import { createChromeLocalAdapter, createStorageRepository } from '../../../src/repositories/chrome-local-adapter';
import { createRecordCache } from '../../../src/repositories/record-cache';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('chrome-local-adapter', () => {
  it.each(['page:', 'missing:'])('无原生 getKeys 时，前缀 %s 的查询只读取一次整库', async (prefix) => {
    const area = createFakeStorageArea();
    await area.set({ 'page:one': { content: '正文' }, 'conversation:one': { messages: [] } });
    const get = vi.spyOn(area, 'get');
    const adapter = createChromeLocalAdapter(area);

    await expect(adapter.getByPrefix(prefix)).resolves.toEqual(prefix === 'page:' ? { 'page:one': { content: '正文' } } : {});
    expect(get).toHaveBeenCalledExactlyOnceWith(null);
  });

  it.each(['page:', 'missing:'])('有原生 getKeys 时，前缀 %s 的查询只读取匹配记录', async (prefix) => {
    const area = createFakeStorageArea();
    await area.set({ 'page:one': { content: '正文' }, 'conversation:one': { messages: [] } });
    const get = vi.spyOn(area, 'get');
    const getKeys = vi.fn(async () => ['page:one', 'conversation:one']);
    const adapter = createChromeLocalAdapter({ ...area, getKeys });

    await expect(adapter.getByPrefix(prefix)).resolves.toEqual(prefix === 'page:' ? { 'page:one': { content: '正文' } } : {});
    expect(getKeys).toHaveBeenCalledOnce();
    if (prefix === 'page:') {
      expect(get).toHaveBeenCalledExactlyOnceWith(['page:one']);
    } else {
      expect(get).not.toHaveBeenCalled();
    }
  });

  it('getKeys 与 getBytesInUse 优先走原生接口，缺省时退化为本地计算', async () => {
    const fallback = createChromeLocalAdapter(createFakeStorageArea());
    await fallback.set({ a: { text: 'hello' }, b: 1 });
    expect((await fallback.getKeys()).sort()).toEqual(['a', 'b']);
    expect(await fallback.getBytesInUse(['a'])).toBe(new TextEncoder().encode(JSON.stringify({ a: { text: 'hello' } })).byteLength);
    expect(await fallback.getBytesInUse([])).toBe(0);

    const area = createFakeStorageArea();
    const getKeys = vi.fn(async () => ['native']);
    const getBytesInUse = vi.fn(async () => 42);
    const native = createChromeLocalAdapter({ ...area, getKeys, getBytesInUse });
    expect(await native.getKeys()).toEqual(['native']);
    expect(await native.getBytesInUse(['native'])).toBe(42);
    expect(getKeys).toHaveBeenCalledOnce();
    expect(getBytesInUse).toHaveBeenCalledWith(['native']);
  });

  it('getKeyRevision 跟随该 key 的写入、删除与整库清空', async () => {
    const adapter = createChromeLocalAdapter(createFakeStorageArea());
    expect(adapter.getKeyRevision('a')).toBe(0);
    await adapter.set({ a: 1 });
    const afterSet = adapter.getKeyRevision('a');
    expect(afterSet).toBeGreaterThan(0);
    await adapter.set({ b: 1 });
    expect(adapter.getKeyRevision('a')).toBe(afterSet);
    await adapter.remove('a');
    expect(adapter.getKeyRevision('a')).toBeGreaterThan(afterSet);
    const beforeClear = adapter.getKeyRevision('untouched');
    await adapter.clear();
    expect(adapter.getKeyRevision('untouched')).toBeGreaterThan(beforeClear);
  });

  it('unlocked 方法不会排在队列里的写入之后', async () => {
    const area = createFakeStorageArea();
    const adapter = createChromeLocalAdapter(area);
    let releaseWrite: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const repository = createStorageRepository(adapter, (storage) => ({
      async slowWrite() {
        await gate;
        await storage.set({ value: 'written' });
      },
      async read() {
        return (await storage.get<{ value?: string }>(['value'])).value ?? null;
      },
    }), { unlocked: ['read'] });

    const write = repository.slowWrite();
    const readWhileQueued = await Promise.race([
      repository.read(),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 20)),
    ]);
    expect(readWhileQueued).toBeNull();
    releaseWrite();
    await write;
    await expect(repository.read()).resolves.toBe('written');
  });
});

describe('record-cache', () => {
  it('同一修订号内复用已解析记录，写入后失效', async () => {
    const adapter = createChromeLocalAdapter(createFakeStorageArea());
    const parse = vi.fn((value: unknown) => ({ ...(value as { n: number }), parsed: true }));
    const cache = createRecordCache(adapter, parse);
    await expect(cache.read('k')).resolves.toBeNull();
    await adapter.set({ k: { n: 1 } });
    await expect(cache.read('k')).resolves.toEqual({ n: 1, parsed: true });
    await expect(cache.read('k')).resolves.toEqual({ n: 1, parsed: true });
    expect(parse).toHaveBeenCalledTimes(1);

    await adapter.set({ k: { n: 2 } });
    await expect(cache.read('k')).resolves.toEqual({ n: 2, parsed: true });
    expect(parse).toHaveBeenCalledTimes(2);

    await cache.write('k', { n: 3, parsed: true });
    await expect(cache.read('k')).resolves.toEqual({ n: 3, parsed: true });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('另一个适配器实例的写入与整库清空同样让缓存失效', async () => {
    const area = createFakeStorageArea();
    const first = createChromeLocalAdapter(area);
    const second = createChromeLocalAdapter(area);
    const cache = createRecordCache(first, (value) => value as { n: number });
    await second.set({ k: { n: 1 } });
    await expect(cache.read('k')).resolves.toEqual({ n: 1 });
    await second.set({ k: { n: 2 } });
    await expect(cache.read('k')).resolves.toEqual({ n: 2 });
    await second.clear();
    await expect(cache.read('k')).resolves.toBeNull();
  });

  it('超过容量时淘汰最早的条目', async () => {
    const adapter = createChromeLocalAdapter(createFakeStorageArea());
    const parse = vi.fn((value: unknown) => value);
    const cache = createRecordCache(adapter, parse, 2);
    await adapter.set({ a: 1, b: 2, c: 3 });
    await cache.read('a');
    await cache.read('b');
    await cache.read('c');
    await cache.read('a');
    expect(parse).toHaveBeenCalledTimes(4);
  });
});
