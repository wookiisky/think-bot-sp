import { describe, expect, it } from 'vitest';

import { normalizeExtractionText } from '../../../src/features/workspace/extraction-text';

describe('normalizeExtractionText', () => {
  it('会统一删除 Markdown 纯文本中的空行', () => {
    expect(normalizeExtractionText('## 标题\n\n- 要点\n\n\n结论')).toBe('## 标题\n- 要点\n结论');
  });

  it('会兼容空白字符和 CRLF 换行', () => {
    expect(normalizeExtractionText('第一行\r\n   \r\n第二行\r\n')).toBe('第一行\n第二行');
  });
});
