import { describe, expect, it } from 'vitest';

import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('fake-storage', () => {
  it('读写时会复制对象，避免共享同一引用', async () => {
    const storage = createFakeStorageArea();
    const value = { nested: { count: 1 } };

    await storage.set({ demo: value });
    value.nested.count = 2;

    const firstRead = await storage.get<{ demo: typeof value }>(['demo']);
    expect(firstRead.demo.nested.count).toBe(1);

    firstRead.demo.nested.count = 3;

    const secondRead = await storage.get<{ demo: typeof value }>(['demo']);
    expect(secondRead.demo.nested.count).toBe(1);
  });
});
