import { z } from 'zod';

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

const promptTabStateSchema = z.object({
  promptTabId: z.string().min(1),
  initializedAt: z.number().int().nonnegative().nullable(),
  lastAutoTriggerAt: z.number().int().nonnegative().nullable(),
  autoTriggerStatus: z.enum(['idle', 'queued', 'running', 'done', 'error']),
  lastClearedAt: z.number().int().nonnegative().nullable(),
});

export const pageRecordSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().min(1),
    normalizedUrl: z.string().min(1),
    title: z.string(),
    faviconUrl: z.string(),
    content: z.string(),
    extractionMethod: z.enum(['readability', 'jina']),
    includePageContent: z.boolean(),
    promptTabStates: z.array(promptTabStateSchema),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
  })
  .superRefine((value, ctx) => {
    if (value.id !== value.normalizedUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'page id must match normalizedUrl',
        path: ['id'],
      });
    }

    if (value.expiresAt <= value.updatedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'expiresAt must be later than updatedAt',
        path: ['expiresAt'],
      });
    }
  });

/** 统一归一化页面 URL。 */
export const normalizePageUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl);
  url.hash = '';

  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key)) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
};

/** 创建页面记录。 */
export const buildPageRecord = ({
  url,
  promptTabStates = [],
  now = Date.now(),
}: {
  url: string;
  promptTabStates?: Array<z.input<typeof promptTabStateSchema>>;
  now?: number;
}) =>
  pageRecordSchema.parse({
    id: normalizePageUrl(url),
    url,
    normalizedUrl: normalizePageUrl(url),
    title: '',
    faviconUrl: '',
    content: '',
    extractionMethod: 'readability',
    includePageContent: true,
    promptTabStates,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + NINETY_DAYS,
  });

/** 重置单个 promptTab 的运行态，不动页面级开关。 */
export const resetPromptTabState = (page: z.infer<typeof pageRecordSchema>, promptTabId: string, now: number) =>
  pageRecordSchema.parse({
    ...page,
    promptTabStates: page.promptTabStates.map((item) =>
      item.promptTabId === promptTabId
        ? {
            promptTabId,
            initializedAt: null,
            lastAutoTriggerAt: null,
            autoTriggerStatus: 'idle',
            lastClearedAt: now,
          }
        : item,
    ),
    updatedAt: now,
    expiresAt: now + NINETY_DAYS,
  });
