import { describe, expect, it } from 'vitest';

import { toModelMessages } from '../../../../src/services/llm-dispatch/model-messages';

describe('toModelMessages', () => {
  it('无图片时保持字符串内容，系统和助手消息不带 images', () => {
    expect(toModelMessages([
      { role: 'system', content: '系统提示', images: [] },
      { role: 'user', content: '你好', images: [] },
      { role: 'assistant', content: '回答', images: [] },
    ])).toEqual([
      { role: 'system', content: '系统提示' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '回答' },
    ]);
  });

  it('用户图片展开为 image part，data URL 原样透传，远程地址转 URL 对象', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const [message] = toModelMessages([
      { role: 'user', content: '看图', images: [dataUrl, 'https://example.com/a.png', '  '] },
    ]);
    expect(message).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image', image: dataUrl },
        { type: 'image', image: new URL('https://example.com/a.png') },
      ],
    });
  });

  it('只有图片没有文本时不产生空 text part', () => {
    const [message] = toModelMessages([{ role: 'user', content: '  ', images: ['data:image/png;base64,AAAA'] }]);
    expect(message).toEqual({
      role: 'user',
      content: [{ type: 'image', image: 'data:image/png;base64,AAAA' }],
    });
  });
});
