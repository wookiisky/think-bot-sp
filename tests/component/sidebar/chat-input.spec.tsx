import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '../../../src/features/sidebar/chat-input';

describe('ChatInput', () => {
  it('没有文本也没有图片时禁止发送', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        selectedModelId="model-1"
        models={[
          {
            id: 'model-1',
            name: '主模型',
            supportsImages: true,
          },
        ]}
        defaultIncludePageContent={true}
        onSend={onSend}
        onStop={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('请输入文本或添加图片')).toBeVisible();
  });
});
