import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({
  render: renderSpy,
}));

vi.mock('react-dom/client', () => ({
  createRoot: createRootSpy,
}));

describe('react entrypoint root', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    createRootSpy.mockClear();
    renderSpy.mockClear();
  });

  it('同一个挂载节点重复渲染时只创建一次 root', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const { renderEntrypointApp } = await import('../../../src/shared/react-entrypoint-root');

    renderEntrypointApp('first render');
    renderEntrypointApp('second render');

    expect(createRootSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy).toHaveBeenNthCalledWith(1, 'first render');
    expect(renderSpy).toHaveBeenNthCalledWith(2, 'second render');
  });

  it('挂载节点不存在时抛出明确错误', async () => {
    const { renderEntrypointApp } = await import('../../../src/shared/react-entrypoint-root');

    expect(() => renderEntrypointApp('missing root', 'missing')).toThrow('未找到 React 挂载节点: #missing');
  });
});
