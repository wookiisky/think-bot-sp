import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '../../../src/features/sidebar/chat-input';

afterEach(() => {
  cleanup();
});

describe('ChatInput', () => {
  it('没有文本也没有图片时不会发送', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text=""
        images={[]}
        includePageContent={true}
        selectedModelId="model-1"
        models={[
          {
            id: 'model-1',
            name: '主模型',
            supportsImages: true,
          },
        ]}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('受控输入变化会通过回调上抛', async () => {
    const user = userEvent.setup();
    const onTextChange = vi.fn();
    const onIncludePageContentChange = vi.fn();
    const onSelectModel = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text="默认草稿"
        images={[]}
        includePageContent={true}
        selectedModelId="model-1"
        models={[
          {
            id: 'model-1',
            name: '主模型',
            supportsImages: true,
          },
          {
            id: 'model-2',
            name: '备用模型',
            supportsImages: false,
          },
        ]}
        onSelectModel={onSelectModel}
        onTextChange={onTextChange}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={onIncludePageContentChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText('聊天输入'));
    await user.type(screen.getByLabelText('聊天输入'), '新的草稿');
    await user.click(screen.getByLabelText('包含页面内容'));
    await user.selectOptions(screen.getByLabelText('选择模型'), 'model-2');

    expect(onTextChange).toHaveBeenCalled();
    expect(onIncludePageContentChange).toHaveBeenCalledWith(false);
    expect(onSelectModel).toHaveBeenCalledWith('model-2');
  });

  it('清空按钮会回调到当前标签动作', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text="已有内容"
        images={[]}
        includePageContent={true}
        selectedModelId="model-1"
        models={[
          {
            id: 'model-1',
            name: '主模型',
            supportsImages: true,
          },
        ]}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onClear={onClear}
        onExport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '清空当前标签' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('已选图片会渲染预览并支持移除', async () => {
    const user = userEvent.setup();
    const onImagesChange = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text=""
        images={['data:image/png;base64,aaa', 'data:image/png;base64,bbb']}
        includePageContent={true}
        selectedModelId="model-1"
        models={[
          {
            id: 'model-1',
            name: '主模型',
            supportsImages: true,
          },
        ]}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={onImagesChange}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByAltText('已选图片 1')).toBeVisible();
    expect(screen.getByAltText('已选图片 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '移除图片 1' }));

    expect(onImagesChange).toHaveBeenCalledWith(['data:image/png;base64,bbb']);
  });

  it('支持拖拽调整输入区高度', () => {
    render(
      <ChatInput
        disabled={false}
        sending={false}
        text=""
        images={[]}
        includePageContent={true}
        selectedModelId="model-1"
        models={[
          {
            id: 'model-1',
            name: '主模型',
            supportsImages: true,
          },
        ]}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText('聊天输入');
    expect(textarea).toHaveStyle({ height: '144px' });

    fireEvent.pointerDown(screen.getByTestId('chat-input-resize-handle'), {
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      clientY: 220,
    });
    fireEvent.pointerUp(window);

    expect(textarea).toHaveStyle({ height: '184px' });
  });
});
