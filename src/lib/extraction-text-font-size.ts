import type { ExtractionTextFontSize } from '../domain/config/config-schema';

/** 提取区字号档位到样式类的映射。 */
const extractionTextFontSizeClassMap: Record<ExtractionTextFontSize, string> = {
  1: 'text-xs leading-5',
  2: 'text-sm leading-5',
  3: 'text-sm leading-6',
  4: 'text-base leading-7',
  5: 'text-lg leading-8',
  6: 'text-xl leading-9',
  7: 'text-2xl leading-10',
};

/** 根据设置里的字号档位返回提取区文本样式。 */
export const getExtractionTextClassName = (fontSize: ExtractionTextFontSize) => extractionTextFontSizeClassMap[fontSize];
