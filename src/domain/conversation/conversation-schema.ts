import { z } from 'zod';

/** 生成会话稳定主键。 */
export const buildConversationKey = (normalizedUrl: string, promptTabId: string): string =>
  `${normalizedUrl}:${(() => {
    if (promptTabId.includes(':')) {
      throw new Error('promptTabId cannot contain ":"');
    }

    return promptTabId;
  })()}`;

const branchRecordSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  modelLabel: z.string().min(1),
  content: z.string(),
  status: z.enum(['loading', 'done', 'error', 'cancelled']),
  errorMessage: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

const messageRecordSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    images: z.array(z.string()),
    status: z.enum(['loading', 'done', 'error', 'cancelled']),
    modelId: z.string().nullable(),
    branches: z.array(branchRecordSchema),
    retryFromMessageId: z.string().nullable(),
    editedAt: z.number().int().nonnegative().nullable(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((value, ctx) => {
    if (value.role !== 'assistant' && value.branches.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'branches must attach to assistant message',
        path: ['branches'],
      });
    }
  });

export const conversationRecordSchema = z
  .object({
    id: z.string().min(1),
    normalizedUrl: z.string().min(1),
    promptTabId: z.string().min(1).refine((value) => !value.includes(':'), {
      message: 'promptTabId cannot contain ":"',
    }),
    messages: z.array(messageRecordSchema),
    lastAssistantState: z
      .object({
        messageId: z.string().min(1),
        status: z.enum(['loading', 'done', 'error', 'cancelled']),
        summary: z.string(),
      })
      .nullable(),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((value, ctx) => {
    if (value.id !== buildConversationKey(value.normalizedUrl, value.promptTabId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'conversation id must match normalizedUrl and promptTabId',
        path: ['id'],
      });
    }

    const messageIds = value.messages.map((item) => item.id);
    if (new Set(messageIds).size !== messageIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'message id must be unique',
        path: ['messages'],
      });
    }

    const branchIds: string[] = [];
    for (const message of value.messages) {
      for (const branch of message.branches) {
        branchIds.push(branch.id);
      }
    }

    if (new Set(branchIds).size !== branchIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'branch id must be unique across conversation',
        path: ['messages'],
      });
    }
  });
