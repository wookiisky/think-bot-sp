import { z } from 'zod';

/** 最近一次错误来源。 */
export const recentErrorSourceSchema = z.enum(['sidebar', 'conversations', 'sync', 'settings']);

/** 最近一次错误摘要。 */
export const recentErrorSummarySchema = z.object({
  source: recentErrorSourceSchema,
  operation: z.string().min(1),
  message: z.string().min(1),
  capturedAt: z.number().int().nonnegative(),
});

export type RecentErrorSummary = z.infer<typeof recentErrorSummarySchema>;

/** 对错误摘要中的敏感内容做最小脱敏。 */
export const sanitizeRecentErrorMessage = (message: string): string => {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return 'unknown error';
  }

  const redactedMessage = normalizedMessage
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(api[-_ ]?key|token|password)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/(api[-_ ]?key|token|password)\s*:\s*([^\s]+)/gi, '$1: [redacted]');

  return redactedMessage.length > 240 ? `${redactedMessage.slice(0, 240)}...` : redactedMessage;
};

/** 构造最近一次错误摘要。 */
export const buildRecentErrorSummary = (
  input: Omit<RecentErrorSummary, 'capturedAt' | 'message'> & {
    /** 原始错误信息。 */
    message: string;
  },
  now: () => number = () => Date.now(),
): RecentErrorSummary =>
  recentErrorSummarySchema.parse({
    ...input,
    message: sanitizeRecentErrorMessage(input.message),
    capturedAt: now(),
  });
