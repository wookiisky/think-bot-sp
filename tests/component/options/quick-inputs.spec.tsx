import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { QuickInputsPanel } from '../../../src/features/settings/quick-inputs-panel';

describe('QuickInputsPanel', () => {
  afterEach(() => cleanup());

  it('渲染快捷输入预览', () => {
    render(
      <QuickInputsPanel
        quickInputs={[
          { id: 'quick-1', name: '总结', prompt: '请总结当前页面' },
          { id: 'quick-2', name: '翻译', prompt: '请翻译当前页面' },
        ]}
      />,
    );

    expect(screen.getByText('总结')).toBeInTheDocument();
    expect(screen.getByText('请总结当前页面')).toBeInTheDocument();
    expect(screen.getByText('翻译')).toBeInTheDocument();
  });

  it('点击后折叠隐藏预览', () => {
    render(
      <QuickInputsPanel
        quickInputs={[
          { id: 'quick-1', name: '总结', prompt: '请总结当前页面' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '收起预览' }));

    expect(screen.queryByText('总结')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开预览' })).toBeInTheDocument();
  });
});
