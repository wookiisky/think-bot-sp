import type { ImagePart, ModelMessage, TextPart } from 'ai';

/** dispatch 层维护的对话历史消息：文本加图片列表。 */
export type HistoryMessage = {
  /** 消息角色。 */
  role: 'user' | 'assistant' | 'system';
  /** 文本内容。 */
  content: string;
  /** 图片列表；用户消息为 data URL 或 http(s) URL，其他角色恒为空。 */
  images: string[];
};

const HTTP_URL_PATTERN = /^https?:\/\//i;

/** AI SDK 对字符串一律按 base64 / data URL 解析，远程地址必须显式给 URL 对象。 */
const toImagePart = (image: string): ImagePart => ({
  type: 'image',
  image: HTTP_URL_PATTERN.test(image) ? new URL(image) : image,
});

/**
 * 把历史消息转换成 AI SDK 的 ModelMessage。
 *
 * `streamText` 会用 zod 校验 messages，未知字段 `images` 会被静默剥掉，
 * 所以图片必须显式展开为 `image` part，否则模型根本收不到。
 */
export const toModelMessages = (messages: readonly HistoryMessage[]): ModelMessage[] =>
  messages.map((message): ModelMessage => {
    if (message.role === 'system') {
      return { role: 'system', content: message.content };
    }
    if (message.role === 'assistant') {
      return { role: 'assistant', content: message.content };
    }
    const images = message.images.filter((image) => image.trim().length > 0);
    if (images.length === 0) {
      return { role: 'user', content: message.content };
    }
    const parts: Array<TextPart | ImagePart> = [];
    if (message.content.trim().length > 0) {
      parts.push({ type: 'text', text: message.content });
    }
    parts.push(...images.map(toImagePart));
    return { role: 'user', content: parts };
  });
