import { z } from 'zod';

import { buildLoadingStorageKey } from '../../shared/storage-keys';

const branchStateSchema = z.object({
  branchId: z.string().min(1),
  status: z.enum(['loading', 'cancelled', 'error']),
  modelId: z.string().min(1),
  startedAt: z.number().int().nonnegative().nullable().default(null),
});

export const loadingStateRecordSchema = z
  .object({
    id: z.string().min(1),
    normalizedUrl: z.string().min(1),
    promptTabId: z.string().min(1).refine((value) => !value.includes(':'), {
      message: 'promptTabId cannot contain ":"',
    }),
    sessionId: z.string().min(1),
    promptTabStatus: z.enum(['idle', 'loading', 'cancelled', 'error']),
    startedAt: z.number().int().nonnegative().nullable().default(null),
    branchStates: z.array(branchStateSchema),
    resumeTarget: z
      .object({
        messageId: z.string().min(1),
        branchId: z.string().min(1).optional(),
      })
      .nullable(),
    cancelRequested: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((value, ctx) => {
    if (value.id !== buildLoadingStorageKey(value.normalizedUrl, value.promptTabId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'loading id must match normalizedUrl and promptTabId',
        path: ['id'],
      });
    }

    const uniqueBranchIds = new Set(value.branchStates.map((item) => item.branchId));
    if (uniqueBranchIds.size !== value.branchStates.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'branchStates branchId must be unique',
        path: ['branchStates'],
      });
    }
  });

/** 创建单个 promptTab 的主 loading 记录。 */
export const createLoadingState = ({
  normalizedUrl,
  promptTabId,
  sessionId,
  startedAt = null,
  now = Date.now(),
}: {
  normalizedUrl: string;
  promptTabId: string;
  sessionId: string;
  /** 主请求的大模型调用开始时间。 */
  startedAt?: number | null;
  now?: number;
}) =>
  loadingStateRecordSchema.parse({
    id: buildLoadingStorageKey(normalizedUrl, promptTabId),
    normalizedUrl,
    promptTabId,
    sessionId,
    promptTabStatus: 'loading',
    startedAt,
    branchStates: [],
    resumeTarget: null,
    cancelRequested: false,
    updatedAt: now,
  });
