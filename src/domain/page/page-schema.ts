import { z } from 'zod';

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);
const DOMAIN_TRACKING_PARAMS = new Map<string, ReadonlySet<string>>([
  ['mp.weixin.qq.com', new Set(['poc_token'])],
]);

const promptTabStateSchema = z.object({
  promptTabId: z.string().min(1),
  initializedAt: z.number().int().nonnegative().nullable(),
  lastAutoTriggerAt: z.number().int().nonnegative().nullable(),
  autoTriggerStatus: z.enum(['idle', 'queued', 'running', 'done', 'error']),
  lastClearedAt: z.number().int().nonnegative().nullable(),
});

const extractionMethodSchema = z.enum(['readability', 'jina']);

const extractionCacheItemSchema = z.object({
  content: z.string(),
  updatedAt: z.number().int().nonnegative(),
});

const extractionCachesSchema = z
  .object({
    readability: extractionCacheItemSchema.optional(),
    jina: extractionCacheItemSchema.optional(),
  })
  .default({});

const pageRecordBaseSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  normalizedUrl: z.string().min(1),
  title: z.string(),
  faviconUrl: z.string(),
  content: z.string(),
  extractionMethod: extractionMethodSchema,
  extractionCaches: extractionCachesSchema,
  includePageContent: z.boolean(),
  promptTabStates: z.array(promptTabStateSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});

export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;
export type PageRecord = z.infer<typeof pageRecordBaseSchema>;
export type ExtractionCaches = PageRecord['extractionCaches'];

/** 判断某个提取方法缓存是否有可用正文。 */
export const hasUsableExtractionCache = (cache: ExtractionCaches[ExtractionMethod] | undefined): cache is NonNullable<ExtractionCaches[ExtractionMethod]> =>
  Boolean(cache?.content.trim());

/** 根据当前提取方法重建页面正文镜像。 */
export const rebuildPageContentFromExtractionCache = <T extends { content: string; extractionMethod: ExtractionMethod; extractionCaches: ExtractionCaches }>(
  page: T,
): T => {
  const cache = page.extractionCaches[page.extractionMethod];
  return {
    ...page,
    content: hasUsableExtractionCache(cache) ? cache.content : '',
  };
};

const withLegacyExtractionCache = (value: unknown) => {
  const parsed = pageRecordBaseSchema.parse(value);
  if (Object.keys(parsed.extractionCaches).length > 0 || !parsed.content.trim()) {
    return parsed;
  }

  return {
    ...parsed,
    extractionCaches: {
      ...parsed.extractionCaches,
      [parsed.extractionMethod]: {
        content: parsed.content,
        updatedAt: parsed.updatedAt,
      },
    },
  };
};

export const pageRecordSchema = z
  .preprocess(withLegacyExtractionCache, pageRecordBaseSchema)
  .transform((value) => rebuildPageContentFromExtractionCache(value))
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
  const domainTrackingParams = DOMAIN_TRACKING_PARAMS.get(url.hostname) ?? new Set<string>();

  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key) || domainTrackingParams.has(key)) {
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

/** 更新单个 promptTab 的运行态，不动页面级正文与开关。 */
export const updatePromptTabState = (
  page: z.infer<typeof pageRecordSchema>,
  input: {
    /** promptTab 稳定 id。 */
    promptTabId: string;
    /** 初始化时间。 */
    initializedAt?: number | null;
    /** 最近一次自动触发时间。 */
    lastAutoTriggerAt?: number | null;
    /** 自动触发状态。 */
    autoTriggerStatus?: 'idle' | 'queued' | 'running' | 'done' | 'error';
    /** 最近一次清空时间。 */
    lastClearedAt?: number | null;
  },
  now: number,
) => {
  const currentState =
    page.promptTabStates.find((item) => item.promptTabId === input.promptTabId) ?? {
      promptTabId: input.promptTabId,
      initializedAt: null,
      lastAutoTriggerAt: null,
      autoTriggerStatus: 'idle' as const,
      lastClearedAt: null,
    };
  const nextState = {
    ...currentState,
    promptTabId: input.promptTabId,
    ...(input.initializedAt !== undefined ? { initializedAt: input.initializedAt } : {}),
    ...(input.lastAutoTriggerAt !== undefined ? { lastAutoTriggerAt: input.lastAutoTriggerAt } : {}),
    ...(input.autoTriggerStatus !== undefined ? { autoTriggerStatus: input.autoTriggerStatus } : {}),
    ...(input.lastClearedAt !== undefined ? { lastClearedAt: input.lastClearedAt } : {}),
  };
  const exists = page.promptTabStates.some((item) => item.promptTabId === input.promptTabId);

  return pageRecordSchema.parse({
    ...page,
    promptTabStates: exists
      ? page.promptTabStates.map((item) => (item.promptTabId === input.promptTabId ? nextState : item))
      : [...page.promptTabStates, nextState],
    updatedAt: now,
    expiresAt: now + NINETY_DAYS,
  });
};
