import { z } from 'zod';

import { buildLoadingStorageKey } from '../../shared/storage-keys';

const branchStateSchema = z.object({
  branchId: z.string().min(1),
  status: z.enum(['loading', 'cancelled', 'error']),
  modelId: z.string().min(1),
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
  now = Date.now(),
}: {
  normalizedUrl: string;
  promptTabId: string;
  sessionId: string;
  now?: number;
}) =>
  loadingStateRecordSchema.parse({
    id: buildLoadingStorageKey(normalizedUrl, promptTabId),
    normalizedUrl,
    promptTabId,
    sessionId,
    promptTabStatus: 'loading',
    branchStates: [],
    resumeTarget: null,
    cancelRequested: false,
    updatedAt: now,
  });
