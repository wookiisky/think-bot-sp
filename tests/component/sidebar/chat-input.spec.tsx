import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '../../../src/features/sidebar/chat-input';

const translations: Record<string, string> = {
  'common.cancel': '取消',
  'workspace.send': '发送',
  'workspace.selectModel': '选择模型',
  'workspace.chatInput': '聊天输入',
  'workspace.includePageContent': '包含页面内容',
  'workspace.clearCurrentTab': '清空当前标签',
  'workspace.addImage': '添加图片',
  'workspace.removeImage': '移除图片',
  'workspace.selectedImage': '已选图片',
  'workspace.resizeComposer': '调整输入区高度',
  'workspace.exportConversation': '导出',
  'workspace.model': '模型',
  'workspace.noModels': '暂无可用模型',
  'workspace.notice.clearTabConfirm': '确认清空当前标签',
};

const t = (key: string) => translations[key] ?? key;

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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={onSend}
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
        t={t}
        onSelectModel={onSelectModel}
        onTextChange={onTextChange}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={onIncludePageContentChange}
        onSend={vi.fn()}
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
    expect(screen.queryByText('当前模型不支持图片输入')).toBeNull();
  });

  it('清空按钮会先弹出确认，再回调到当前标签动作', async () => {
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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onClear={onClear}
        onExport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '清空当前标签' }));
    expect(onClear).not.toHaveBeenCalled();
    await user.click(within(screen.getByTestId('clear-tab-confirm')).getByRole('button', { name: '清空当前标签' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('已选图片会渲染预览并支持确认后移除', async () => {
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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={onImagesChange}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByAltText('已选图片 1')).toBeVisible();
    expect(screen.getByAltText('已选图片 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '移除图片 1' }));
    expect(onImagesChange).not.toHaveBeenCalled();
    await user.click(within(screen.getByTestId('remove-image-confirm-1')).getByRole('button', { name: '移除图片' }));

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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText('聊天输入');
    expect(textarea).toHaveStyle({ height: '32px' });
    expect(screen.getByTestId('chat-input-resize-handle')).toHaveClass(
      'absolute',
      'inset-x-0',
      '-top-1',
      'h-2',
      'bg-transparent',
      'after:bg-transparent',
      'hover:after:bg-primary',
    );
    expect(screen.getByTestId('chat-input-resize-handle')).not.toHaveClass('bg-muted-foreground/35', 'hover:bg-primary');

    fireEvent.pointerDown(screen.getByTestId('chat-input-resize-handle'), {
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      clientY: 220,
    });
    fireEvent.pointerUp(window);

    expect(textarea).toHaveStyle({ height: '72px' });
  });

  it('按 Enter 会直接发送当前输入', () => {
    const onSend = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text="直接发送"
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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={onSend}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText('聊天输入'), {
      key: 'Enter',
    });

    expect(onSend).toHaveBeenCalledWith({
      text: '直接发送',
      images: [],
      modelId: 'model-1',
      includePageContent: true,
    });
  });

  it('Shift+Enter 只换行，不会发送', () => {
    const onSend = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text="保留换行"
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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={onSend}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText('聊天输入'), {
      key: 'Enter',
      shiftKey: true,
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('输入法组合期间按 Enter 不会发送', () => {
    const onSend = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        text="拼音输入"
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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={onSend}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('聊天输入');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, {
      key: 'Enter',
    });

    expect(onSend).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, {
      key: 'Enter',
    });

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('输入区工具控件使用统一高度、无圆角并紧凑排列', () => {
    render(
      <ChatInput
        disabled={false}
        sending={false}
        text="布局检查"
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
        t={t}
        onSelectModel={vi.fn()}
        onTextChange={vi.fn()}
        onImagesChange={vi.fn()}
        onIncludePageContentChange={vi.fn()}
        onSend={vi.fn()}
        onClear={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chat-input-section')).toHaveClass('px-2', 'py-1');
    expect(screen.getByTestId('chat-input-panel')).toHaveClass('gap-1');
    expect(screen.getByTestId('chat-input-control-row')).toHaveClass('items-center');
    expect(screen.getByTestId('chat-input-control-row')).toHaveClass('gap-1');
    expect(screen.getByLabelText('聊天输入')).toHaveClass('rounded-none');
    expect(screen.getByTestId('chat-input-add-image-control')).toHaveClass('size-8', 'rounded-none');
    expect(screen.getByLabelText('选择模型')).toHaveClass('h-8', 'rounded-none');
    expect(screen.getByLabelText('包含页面内容')).toHaveClass('size-8', 'rounded-none');
    expect(screen.getByRole('button', { name: '清空当前标签' })).toHaveClass('size-8', 'rounded-none');
    expect(screen.getByRole('button', { name: '导出' })).toHaveClass('size-8', 'rounded-none');
    expect(screen.getByRole('button', { name: '发送' })).toHaveClass('size-8', 'rounded-none');
  });
});
