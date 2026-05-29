declare module 'turndown' {
  type TurndownOptions = {
    /** 无序列表标记。 */
    bulletListMarker?: '-' | '+' | '*';
    /** 代码块风格。 */
    codeBlockStyle?: 'indented' | 'fenced';
    /** 标题风格。 */
    headingStyle?: 'setext' | 'atx';
  };

  export default class TurndownService {
    /** 创建 Markdown 转换器。 */
    constructor(options?: TurndownOptions);
    /** 将 HTML 转换为 Markdown。 */
    turndown(input: string): string;
  }
}
