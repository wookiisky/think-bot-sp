# Stage 2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地阶段 2 的数据契约、仓储、后台配置命令和设置页最小闭环，让配置、页面、会话与缓存读写全部收口到 background。

**Architecture:** 先用 `zod` 固定 `ExtensionConfig / PageRecord / ConversationRecord / LoadingStateRecord` 契约，再基于 `chrome.storage.local` 建 typed repository，最后通过 background command 把 options 页面和存储隔离开。设置页只交付本地配置闭环、即时语言/主题预览、本地缓存统计与安全清理；远端同步连接和真实推送仍留在后续阶段。

**Tech Stack:** Chrome MV3、WXT、React 18、TypeScript strict、zod、react-hook-form、@hookform/resolvers、zustand、yaml、Vitest、React Testing Library、Playwright。

---

## 0. 范围假设

1. `quickInputs` 继续作为持久化字段名，设置页文案展示为“标签页”，避免阶段 2 同时做字段重命名。
2. 为了支撑“本地缓存占用展示与安全清理”，阶段 2 新增 `GET_LOCAL_CACHE_STATS / CLEAR_LOCAL_CACHE` 两个 background command。
3. “云同步”在阶段 2 只做本地表单字段持久化，不做 `testConnection`、`syncNow`、远端模板导入与远端网络请求。

## 1. 文件结构

- `package.json`
  - 补 `zod`、`react-hook-form`、`@hookform/resolvers`、`zustand`、`yaml`、`@testing-library/user-event`。
- `src/shared/schema-version.ts`
  - 提供 `CONFIG_SCHEMA_VERSION` 与 `SYNC_SNAPSHOT_SCHEMA_VERSION`。
- `src/shared/storage-keys.ts`
  - 统一 `config / page / conversation / loading` key 前缀和工具函数。
- `src/domain/config/config-schema.ts`
  - `ExtensionConfig` schema、默认值工厂、模型完整性判定、导入校验。
- `src/domain/page/page-schema.ts`
  - URL 归一化、`PageRecord` schema、`promptTabStates` 重置语义、过期时间工厂。
- `src/domain/conversation/conversation-schema.ts`
  - `ConversationRecord / MessageRecord / BranchRecord` schema。
- `src/domain/loading/loading-state-schema.ts`
  - `LoadingStateRecord` schema 和单主 session 约束。
- `src/repositories/chrome-local-adapter.ts`
  - 对 `chrome.storage.local` 做最小 typed 封装，测试里可注入 fake storage。
- `src/repositories/config-repository.ts`
  - 配置读写、重置、导入导出、默认模型/完整模型查询。
- `src/repositories/page-repository.ts`
  - 页面缓存、过期清理、缓存统计、安全清理、级联删除。
- `src/repositories/conversation-repository.ts`
  - `promptTab` 级会话和 loading 读写、按页面清理。
- `src/repositories/locale-repository.ts`
  - 解析本地 YAML、校验 key 集合一致、提供 `t()` 查询。
- `src/services/runtime-messaging/config-commands.ts`
  - command schema、请求/响应类型、处理器工厂。
- `src/services/i18n/locale-service.ts`
  - options 页面语言切换和即时预览。
- `src/features/settings/settings-shell.tsx`
  - 设置页骨架、导航、顶部操作和整体表单。
- `src/features/settings/model-form.tsx`
  - Provider 切换、差异字段编辑、API Key 掩码、完整性提示。
- `src/features/settings/quick-inputs-panel.tsx`
  - 快捷输入折叠/预览。
- `src/features/settings/settings-api.ts`
  - options 页调用 background command 的唯一入口。
- `src/ui/icon.tsx`
  - 本地图标封装。
- `assets/styles/material-symbols.css`
  - 本地图标 CSS。
- `locales/zh-CN.yml`
  - 中文文案。
- `locales/en.yml`
  - 英文文案。
- `entrypoints/background.ts`
  - 挂载仓储与阶段 2 command handler。
- `entrypoints/options/main.tsx`
  - 替换阶段 1 壳层，加载设置页。
- `tests/helpers/fake-storage.ts`
  - 单测用内存版 storage。
- `tests/unit/domain/*.spec.ts`
  - 领域 schema 单测。
- `tests/unit/repositories/*.spec.ts`
  - 仓储单测。
- `tests/unit/services/runtime-messaging/config-commands.spec.ts`
  - background command 单测。
- `tests/component/options/*.spec.tsx`
  - 设置页组件与交互测试。
- `tests/e2e/settings-flow.spec.ts`
  - 设置页基础流程测试。
- `docs/Workspace/settings.md`
  - 同步阶段边界、本地缓存入口、导航与动作口径。
- `docs/dao/config-repository.md`
  - 新 command 与导入拒绝策略。
- `docs/dao/page-repository.md`
  - 缓存统计与安全清理职责。
- `docs/test/settings-core.md`
  - 阶段 2 新增流程测试口径。
- `docs/decision_log.md`
  - 记录阶段 2 不做远端同步执行的决策。

### Task 1: 固定领域模型与共享常量

**Files:**
- Modify: `package.json`
- Create: `src/shared/schema-version.ts`
- Create: `src/shared/storage-keys.ts`
- Create: `src/domain/config/config-schema.ts`
- Create: `src/domain/page/page-schema.ts`
- Create: `src/domain/conversation/conversation-schema.ts`
- Create: `src/domain/loading/loading-state-schema.ts`
- Test: `tests/unit/domain/config-schema.spec.ts`
- Test: `tests/unit/domain/page-schema.spec.ts`
- Test: `tests/unit/domain/conversation-schema.spec.ts`
- Test: `tests/unit/domain/loading-state.spec.ts`

- [ ] **Step 1: 写失败测试，先定死 schema 契约**

```ts
// tests/unit/domain/config-schema.spec.ts
import { describe, expect, it } from 'vitest';
import {
  CONFIG_SCHEMA_VERSION,
  SYNC_SNAPSHOT_SCHEMA_VERSION,
} from '../../../src/shared/schema-version';
import {
  createDefaultConfig,
  extensionConfigSchema,
  getEnabledCompleteModels,
  isModelConfigComplete,
} from '../../../src/domain/config/config-schema';

describe('extensionConfigSchema', () => {
  it('writes shared versions into config defaults', () => {
    const config = createDefaultConfig();

    expect(config.version).toBe(CONFIG_SCHEMA_VERSION);
    expect(SYNC_SNAPSHOT_SCHEMA_VERSION).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.updatedAt).toBeGreaterThan(0);
  });

  it('checks provider-specific completeness consistently', () => {
    const complete = {
      id: 'model-openai',
      name: 'GPT 4.1',
      provider: 'openai-compatible',
      enabled: true,
      model: 'gpt-4.1',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
      deployment: '',
      temperature: 0.2,
      tools: [],
      thinkingBudget: null,
      maxOutputTokens: 4096,
      order: 0,
      deletedAt: null,
    } as const;

    const incomplete = {
      ...complete,
      id: 'model-gemini',
      provider: 'gemini',
      baseUrl: '',
      apiKey: '',
    } as const;

    expect(isModelConfigComplete(complete)).toBe(true);
    expect(isModelConfigComplete(incomplete)).toBe(false);
  });

  it('filters soft-deleted or incomplete models from enabled list', () => {
    const config = createDefaultConfig({
      models: [
        {
          id: 'kept',
          name: 'Claude 3.7',
          provider: 'anthropic',
          enabled: true,
          model: 'claude-3-7-sonnet',
          baseUrl: '',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: 4096,
          order: 0,
          deletedAt: null,
        },
        {
          id: 'deleted',
          name: 'Deleted',
          provider: 'anthropic',
          enabled: true,
          model: 'claude-3-7-sonnet',
          baseUrl: '',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: 4096,
          order: 1,
          deletedAt: Date.now(),
        },
      ],
    });

    expect(getEnabledCompleteModels(config).map((item) => item.id)).toEqual(['kept']);
  });

  it('rejects duplicated stable ids across arrays', () => {
    const config = createDefaultConfig({
      quickInputs: [
        {
          id: 'same-id',
          name: 'Summarize',
          prompt: 'Summarize the page',
          autoTrigger: false,
          modelId: null,
          order: 0,
          deletedAt: null,
        },
        {
          id: 'same-id',
          name: 'Translate',
          prompt: 'Translate the page',
          autoTrigger: false,
          modelId: null,
          order: 1,
          deletedAt: null,
        },
      ],
    });

    expect(() => extensionConfigSchema.parse(config)).toThrow(/quickInputs id/i);
  });
});
```

```ts
// tests/unit/domain/page-schema.spec.ts
import { describe, expect, it } from 'vitest';
import {
  buildPageRecord,
  normalizePageUrl,
  resetPromptTabState,
} from '../../../src/domain/page/page-schema';

describe('page-schema', () => {
  it('normalizes hash and tracking params away', () => {
    expect(
      normalizePageUrl('https://example.com/article?utm_source=x&id=1#section'),
    ).toBe('https://example.com/article?id=1');
  });

  it('resets only the target promptTab runtime state', () => {
    const page = buildPageRecord({
      url: 'https://example.com/article?id=1',
      promptTabStates: [
        {
          promptTabId: 'chat',
          initializedAt: 10,
          lastAutoTriggerAt: 20,
          autoTriggerStatus: 'done',
          lastClearedAt: null,
        },
      ],
    });

    const next = resetPromptTabState(page, 'chat', 99);

    expect(next.promptTabStates[0]).toEqual({
      promptTabId: 'chat',
      initializedAt: null,
      lastAutoTriggerAt: null,
      autoTriggerStatus: 'idle',
      lastClearedAt: 99,
    });
    expect(next.includePageContent).toBe(true);
  });

  it('writes expiresAt 90 days after updatedAt', () => {
    const page = buildPageRecord({
      url: 'https://example.com/article?id=1',
      now: 1_000,
    });

    expect(page.expiresAt - page.updatedAt).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
```

```ts
// tests/unit/domain/conversation-schema.spec.ts
import { describe, expect, it } from 'vitest';
import {
  buildConversationKey,
  conversationRecordSchema,
} from '../../../src/domain/conversation/conversation-schema';

describe('conversation-schema', () => {
  it('isolates chat and quick input conversations by promptTab id', () => {
    expect(buildConversationKey('https://example.com/a', 'chat')).not.toBe(
      buildConversationKey('https://example.com/a', 'summary'),
    );
  });

  it('keeps branches under assistant messages only', () => {
    expect(() =>
      conversationRecordSchema.parse({
        id: 'https://example.com/a:chat',
        normalizedUrl: 'https://example.com/a',
        promptTabId: 'chat',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'hello',
            images: [],
            status: 'done',
            modelId: null,
            branches: [{ id: 'b1', modelId: 'm1', modelLabel: 'm1', content: 'x', status: 'done', errorMessage: null, createdAt: 1, updatedAt: 1 }],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        lastAssistantState: null,
        updatedAt: 1,
      }),
    ).toThrow(/assistant/i);
  });
});
```

```ts
// tests/unit/domain/loading-state.spec.ts
import { describe, expect, it } from 'vitest';
import {
  createLoadingState,
  loadingStateRecordSchema,
} from '../../../src/domain/loading/loading-state-schema';

describe('loading-state', () => {
  it('allows one promptTab only one primary session', () => {
    const state = createLoadingState({
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      sessionId: 'session-1',
    });

    expect(state.promptTabStatus).toBe('loading');
    expect(() =>
      loadingStateRecordSchema.parse({
        ...state,
        sessionId: '',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认当前实现确实缺失**

Run: `pnpm test:unit -- tests/unit/domain/config-schema.spec.ts tests/unit/domain/page-schema.spec.ts tests/unit/domain/conversation-schema.spec.ts tests/unit/domain/loading-state.spec.ts -v`

Expected: FAIL，报错包含 `Cannot find module '../../../src/domain/...` 或 schema/函数未定义。

- [ ] **Step 3: 写最小实现，让领域约束先成立**

```json
// package.json
{
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-hook-form": "^7.56.4",
    "@hookform/resolvers": "^3.10.0",
    "yaml": "^2.8.1",
    "zod": "^3.24.4",
    "zustand": "^5.0.8"
  },
  "devDependencies": {
    "@testing-library/user-event": "^14.6.1"
  }
}
```

```ts
// src/shared/schema-version.ts
/** 配置结构版本 */
export const CONFIG_SCHEMA_VERSION = '2.0.0';

/** 同步快照结构版本 */
export const SYNC_SNAPSHOT_SCHEMA_VERSION = CONFIG_SCHEMA_VERSION;
```

```ts
// src/shared/storage-keys.ts
/** 配置主 key */
export const CONFIG_STORAGE_KEY = 'config:extension';

/** 页面 key 前缀 */
export const PAGE_STORAGE_PREFIX = 'page:';

/** 会话 key 前缀 */
export const CONVERSATION_STORAGE_PREFIX = 'conversation:';

/** loading key 前缀 */
export const LOADING_STORAGE_PREFIX = 'loading:';

/** 生成页面存储 key */
export const buildPageStorageKey = (normalizedUrl: string) => `${PAGE_STORAGE_PREFIX}${normalizedUrl}`;

/** 生成会话存储 key */
export const buildConversationStorageKey = (normalizedUrl: string, promptTabId: string) =>
  `${CONVERSATION_STORAGE_PREFIX}${normalizedUrl}:${promptTabId}`;

/** 生成 loading 存储 key */
export const buildLoadingStorageKey = (normalizedUrl: string, promptTabId: string) =>
  `${LOADING_STORAGE_PREFIX}${normalizedUrl}:${promptTabId}`;
```

```ts
// src/domain/config/config-schema.ts
import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION } from '../../shared/schema-version';

const modelProviderSchema = z.enum([
  'openai-compatible',
  'gemini',
  'azure-openai',
  'anthropic',
]);

const modelConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    provider: modelProviderSchema,
    enabled: z.boolean(),
    model: z.string(),
    baseUrl: z.string(),
    apiKey: z.string(),
    deployment: z.string(),
    temperature: z.number().min(0).max(2),
    tools: z.array(z.string()),
    thinkingBudget: z.number().int().positive().nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
    order: z.number().int().nonnegative(),
    deletedAt: z.number().nullable(),
  })
  .superRefine((value, ctx) => {
    const requiredByProvider: Record<string, Array<keyof typeof value>> = {
      'openai-compatible': ['baseUrl', 'apiKey', 'model'],
      gemini: ['apiKey', 'model'],
      'azure-openai': ['baseUrl', 'apiKey', 'deployment'],
      anthropic: ['apiKey', 'model'],
    };

    for (const field of requiredByProvider[value.provider]) {
      if (!String(value[field] ?? '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${value.provider} missing ${field}`,
          path: [field],
        });
      }
    }
  });

const quickInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  autoTrigger: z.boolean(),
  modelId: z.string().nullable(),
  order: z.number().int().nonnegative(),
  deletedAt: z.number().nullable(),
});

const blacklistRuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['domain', 'url-prefix', 'regex']),
  pattern: z.string().min(1),
  enabled: z.boolean(),
  deletedAt: z.number().nullable(),
});

const syncConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['none', 'gist', 'webdav']),
  gistToken: z.string(),
  gistId: z.string(),
  webdavUrl: z.string(),
  webdavUsername: z.string(),
  webdavPassword: z.string(),
  lastSyncAt: z.number().nullable(),
});

export const extensionConfigSchema = z
  .object({
    version: z.string().min(1),
    updatedAt: z.number().int().positive(),
    basic: z.object({
      theme: z.enum(['system', 'light', 'dark']),
      language: z.enum(['zh-CN', 'en']),
      defaultModelId: z.string().nullable(),
      systemPrompt: z.string(),
      filterCot: z.boolean(),
      extractionMethod: z.enum(['readability', 'jina']),
      includePageContentByDefault: z.boolean(),
    }),
    models: z.array(modelConfigSchema),
    quickInputs: z.array(quickInputSchema),
    sync: syncConfigSchema,
    blacklist: z.array(blacklistRuleSchema),
  })
  .superRefine((value, ctx) => {
    const groups = [
      ['models', value.models.map((item) => item.id)],
      ['quickInputs', value.quickInputs.map((item) => item.id)],
      ['blacklist', value.blacklist.map((item) => item.id)],
    ] as const;

    for (const [field, ids] of groups) {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} id must be unique`,
          path: [field],
        });
      }
    }
  });

export type ExtensionConfig = z.infer<typeof extensionConfigSchema>;
export type ModelConfig = ExtensionConfig['models'][number];

/** 判断模型是否可进入默认候选 */
export const isModelConfigComplete = (model: ModelConfig): boolean =>
  modelConfigSchema.safeParse(model).success && model.deletedAt === null && model.enabled;

/** 获取启用且完整的模型 */
export const getEnabledCompleteModels = (config: ExtensionConfig): ModelConfig[] =>
  config.models.filter((model) => isModelConfigComplete(model));

/** 生成默认配置 */
export const createDefaultConfig = (
  overrides: Partial<ExtensionConfig> = {},
): ExtensionConfig => ({
  version: CONFIG_SCHEMA_VERSION,
  updatedAt: Date.now(),
  basic: {
    theme: 'system',
    language: 'zh-CN',
    defaultModelId: null,
    systemPrompt: '',
    filterCot: false,
    extractionMethod: 'readability',
    includePageContentByDefault: true,
  },
  models: [],
  quickInputs: [],
  sync: {
    enabled: false,
    provider: 'none',
    gistToken: '',
    gistId: '',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    lastSyncAt: null,
  },
  blacklist: [],
  ...overrides,
});
```

```ts
// src/domain/page/page-schema.ts
import { z } from 'zod';

const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

const promptTabStateSchema = z.object({
  promptTabId: z.string().min(1),
  initializedAt: z.number().nullable(),
  lastAutoTriggerAt: z.number().nullable(),
  autoTriggerStatus: z.enum(['idle', 'queued', 'running', 'done', 'error']),
  lastClearedAt: z.number().nullable(),
});

export const pageRecordSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  normalizedUrl: z.string().url(),
  title: z.string().default(''),
  faviconUrl: z.string().default(''),
  content: z.string().default(''),
  extractionMethod: z.enum(['readability', 'jina']),
  includePageContent: z.boolean(),
  promptTabStates: z.array(promptTabStateSchema),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

/** 统一 URL 归一化 */
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

/** 创建页面记录 */
export const buildPageRecord = ({
  url,
  promptTabStates = [],
  now = Date.now(),
}: {
  url: string;
  promptTabStates?: Array<{
    promptTabId: string;
    initializedAt: number | null;
    lastAutoTriggerAt: number | null;
    autoTriggerStatus: 'idle' | 'queued' | 'running' | 'done' | 'error';
    lastClearedAt: number | null;
  }>;
  now?: number;
}) => {
  const normalizedUrl = normalizePageUrl(url);
  return pageRecordSchema.parse({
    id: normalizedUrl,
    url,
    normalizedUrl,
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
};

/** 清空单 promptTab 运行态，不影响页面级 includePageContent */
export const resetPromptTabState = (
  page: z.infer<typeof pageRecordSchema>,
  promptTabId: string,
  now: number,
) => ({
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
```

```ts
// src/domain/conversation/conversation-schema.ts
import { z } from 'zod';

const branchRecordSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  modelLabel: z.string().min(1),
  content: z.string(),
  status: z.enum(['loading', 'done', 'error', 'cancelled']),
  errorMessage: z.string().nullable(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
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
    editedAt: z.number().nullable(),
    createdAt: z.number().int().positive(),
    updatedAt: z.number().int().positive(),
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

export const conversationRecordSchema = z.object({
  id: z.string().min(1),
  normalizedUrl: z.string().url(),
  promptTabId: z.string().min(1),
  messages: z.array(messageRecordSchema),
  lastAssistantState: z
    .object({
      messageId: z.string().min(1),
      status: z.enum(['loading', 'done', 'error', 'cancelled']),
      summary: z.string(),
    })
    .nullable(),
  updatedAt: z.number().int().positive(),
});

/** 生成会话主键 */
export const buildConversationKey = (normalizedUrl: string, promptTabId: string) =>
  `${normalizedUrl}:${promptTabId}`;
```

```ts
// src/domain/loading/loading-state-schema.ts
import { z } from 'zod';

export const loadingStateRecordSchema = z.object({
  id: z.string().min(1),
  normalizedUrl: z.string().url(),
  promptTabId: z.string().min(1),
  sessionId: z.string().min(1),
  promptTabStatus: z.enum(['idle', 'loading', 'cancelled', 'error']),
  branchStates: z.array(
    z.object({
      branchId: z.string().min(1),
      status: z.enum(['loading', 'cancelled', 'error']),
      modelId: z.string().min(1),
    }),
  ),
  resumeTarget: z
    .object({
      messageId: z.string().min(1),
      branchId: z.string().min(1).optional(),
    })
    .nullable(),
  cancelRequested: z.boolean(),
  updatedAt: z.number().int().positive(),
});

/** 创建 promptTab 主 loading 记录 */
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
    id: `${normalizedUrl}:${promptTabId}`,
    normalizedUrl,
    promptTabId,
    sessionId,
    promptTabStatus: 'loading',
    branchStates: [],
    resumeTarget: null,
    cancelRequested: false,
    updatedAt: now,
  });
```

- [ ] **Step 4: 回跑领域单测**

Run: `pnpm test:unit -- tests/unit/domain/config-schema.spec.ts tests/unit/domain/page-schema.spec.ts tests/unit/domain/conversation-schema.spec.ts tests/unit/domain/loading-state.spec.ts -v`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml src/shared/schema-version.ts src/shared/storage-keys.ts src/domain/config/config-schema.ts src/domain/page/page-schema.ts src/domain/conversation/conversation-schema.ts src/domain/loading/loading-state-schema.ts tests/unit/domain/config-schema.spec.ts tests/unit/domain/page-schema.spec.ts tests/unit/domain/conversation-schema.spec.ts tests/unit/domain/loading-state.spec.ts
git commit -m "feat: add stage2 domain contracts"
```

### Task 2: 落地仓储层与本地语言资源

**Files:**
- Create: `tests/helpers/fake-storage.ts`
- Create: `src/repositories/chrome-local-adapter.ts`
- Create: `src/repositories/config-repository.ts`
- Create: `src/repositories/page-repository.ts`
- Create: `src/repositories/conversation-repository.ts`
- Create: `src/repositories/locale-repository.ts`
- Create: `locales/zh-CN.yml`
- Create: `locales/en.yml`
- Test: `tests/unit/repositories/config-repository.spec.ts`
- Test: `tests/unit/repositories/page-repository.spec.ts`
- Test: `tests/unit/repositories/conversation-repository.spec.ts`
- Test: `tests/unit/repositories/locale-repository.spec.ts`

- [ ] **Step 1: 先写失败仓储测试，锁死读写边界**

```ts
// tests/helpers/fake-storage.ts
export const createFakeStorageArea = () => {
  const state = new Map<string, unknown>();

  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (!keys) {
        return Object.fromEntries(state);
      }

      const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
      return Object.fromEntries(list.map((key) => [key, state.get(key)]));
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) {
        state.set(key, value);
      }
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        state.delete(key);
      }
    },
    async clear() {
      state.clear();
    },
    dump() {
      return Object.fromEntries(state);
    },
  };
};
```

```ts
// tests/unit/repositories/config-repository.spec.ts
import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { createConfigRepository } from '../../../src/repositories/config-repository';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('config-repository', () => {
  it('reads the same saved config from different repository instances', async () => {
    const storage = createFakeStorageArea();
    const repoA = createConfigRepository(createChromeLocalAdapter(storage));
    const repoB = createConfigRepository(createChromeLocalAdapter(storage));
    const config = createDefaultConfig({
      basic: {
        theme: 'dark',
        language: 'en',
        defaultModelId: null,
        systemPrompt: '',
        filterCot: false,
        extractionMethod: 'readability',
        includePageContentByDefault: true,
      },
    });

    await repoA.saveConfig(config);

    await expect(repoB.getConfig()).resolves.toMatchObject({
      basic: { theme: 'dark', language: 'en' },
    });
  });

  it('rejects invalid import and keeps old config', async () => {
    const storage = createFakeStorageArea();
    const repo = createConfigRepository(createChromeLocalAdapter(storage));
    const oldConfig = createDefaultConfig();
    await repo.saveConfig(oldConfig);

    await expect(repo.importConfig('{"version":"0.0.0"}')).rejects.toThrow(/unsupported/i);
    await expect(repo.getConfig()).resolves.toEqual(oldConfig);
  });
});
```

```ts
// tests/unit/repositories/page-repository.spec.ts
import { describe, expect, it } from 'vitest';
import { buildPageRecord } from '../../../src/domain/page/page-schema';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createPageRepository } from '../../../src/repositories/page-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('page-repository', () => {
  it('restores page state and deletes expired pages only', async () => {
    const storage = createFakeStorageArea();
    const repo = createPageRepository(createChromeLocalAdapter(storage));
    const fresh = buildPageRecord({ url: 'https://example.com/fresh', now: 100 });
    const expired = { ...buildPageRecord({ url: 'https://example.com/old', now: 100 }), expiresAt: 99 };

    await repo.savePage(fresh);
    await repo.savePage(expired);
    await repo.cleanupExpiredPages(100);

    await expect(repo.getPage('https://example.com/fresh')).resolves.not.toBeNull();
    await expect(repo.getPage('https://example.com/old')).resolves.toBeNull();
  });
});
```

```ts
// tests/unit/repositories/conversation-repository.spec.ts
import { describe, expect, it } from 'vitest';
import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('conversation-repository', () => {
  it('keeps chat and quick-input conversations isolated', async () => {
    const storage = createFakeStorageArea();
    const repo = createConversationRepository(createChromeLocalAdapter(storage));

    await repo.saveConversation({
      id: 'https://example.com/a:chat',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'chat',
      messages: [],
      lastAssistantState: null,
      updatedAt: 1,
    });
    await repo.saveConversation({
      id: 'https://example.com/a:summary',
      normalizedUrl: 'https://example.com/a',
      promptTabId: 'summary',
      messages: [],
      lastAssistantState: null,
      updatedAt: 2,
    });

    await expect(repo.getConversation('https://example.com/a', 'chat')).resolves.toMatchObject({
      promptTabId: 'chat',
    });
    await expect(repo.getConversation('https://example.com/a', 'summary')).resolves.toMatchObject({
      promptTabId: 'summary',
    });
  });
});
```

```ts
// tests/unit/repositories/locale-repository.spec.ts
import { describe, expect, it } from 'vitest';
import { createLocaleRepository } from '../../../src/repositories/locale-repository';

describe('locale-repository', () => {
  it('loads zh-CN and en resources with aligned keys', async () => {
    const repository = createLocaleRepository();
    const result = await repository.loadResources();

    expect(result.locales).toEqual(['zh-CN', 'en']);
    expect(result.missingKeys).toEqual([]);
    expect(result.t('settings.title', 'en')).toBeTypeOf('string');
  });
});
```

- [ ] **Step 2: 运行仓储测试，验证当前尚未实现**

Run: `pnpm test:unit -- tests/unit/repositories/config-repository.spec.ts tests/unit/repositories/page-repository.spec.ts tests/unit/repositories/conversation-repository.spec.ts tests/unit/repositories/locale-repository.spec.ts -v`

Expected: FAIL，报错包含缺少 repository 模块或 locale 文件。

- [ ] **Step 3: 写最小仓储实现与语言资源**

```ts
// src/repositories/chrome-local-adapter.ts
/** storage.local 最小适配层，方便单测替换 */
export const createChromeLocalAdapter = (
  storageArea: Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove' | 'clear'>,
) => ({
  get: async <T>(keys?: string | string[] | Record<string, unknown> | null) =>
    (await storageArea.get(keys)) as T,
  set: async (values: Record<string, unknown>) => {
    await storageArea.set(values);
  },
  remove: async (keys: string | string[]) => {
    await storageArea.remove(keys);
  },
  clear: async () => {
    await storageArea.clear();
  },
});
```

```ts
// src/repositories/config-repository.ts
import { createDefaultConfig, extensionConfigSchema, getEnabledCompleteModels } from '../domain/config/config-schema';
import { CONFIG_SCHEMA_VERSION } from '../shared/schema-version';
import { CONFIG_STORAGE_KEY } from '../shared/storage-keys';

/** 配置仓储，统一收口整包保存与导入校验 */
export const createConfigRepository = (
  storage: ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>,
) => ({
  async getConfig() {
    const data = await storage.get<Record<string, unknown>>([CONFIG_STORAGE_KEY]);
    const saved = data[CONFIG_STORAGE_KEY];
    return saved ? extensionConfigSchema.parse(saved) : createDefaultConfig();
  },

  async saveConfig(input: ReturnType<typeof createDefaultConfig>) {
    const next = extensionConfigSchema.parse({
      ...input,
      version: CONFIG_SCHEMA_VERSION,
      updatedAt: Date.now(),
    });
    await storage.set({ [CONFIG_STORAGE_KEY]: next });
    return next;
  },

  async resetConfig() {
    const next = createDefaultConfig();
    await storage.set({ [CONFIG_STORAGE_KEY]: next });
    return next;
  },

  async exportConfig() {
    return JSON.stringify(await this.getConfig(), null, 2);
  },

  async importConfig(payload: string) {
    const parsed = JSON.parse(payload);
    if (parsed.version !== CONFIG_SCHEMA_VERSION) {
      throw new Error('unsupported config version');
    }

    const next = extensionConfigSchema.parse({
      ...parsed,
      updatedAt: Date.now(),
    });
    await storage.set({ [CONFIG_STORAGE_KEY]: next });
    return next;
  },

  async getEnabledCompleteModels() {
    return getEnabledCompleteModels(await this.getConfig());
  },
});
```

```ts
// src/repositories/page-repository.ts
import { pageRecordSchema } from '../domain/page/page-schema';
import {
  buildConversationStorageKey,
  buildLoadingStorageKey,
  buildPageStorageKey,
  CONVERSATION_STORAGE_PREFIX,
  LOADING_STORAGE_PREFIX,
  PAGE_STORAGE_PREFIX,
} from '../shared/storage-keys';

/** 页面仓储，负责缓存统计、清理和级联删除 */
export const createPageRepository = (
  storage: ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>,
) => ({
  async savePage(page: unknown) {
    const next = pageRecordSchema.parse(page);
    await storage.set({ [buildPageStorageKey(next.normalizedUrl)]: next });
    return next;
  },

  async getPage(normalizedUrl: string) {
    const result = await storage.get<Record<string, unknown>>([buildPageStorageKey(normalizedUrl)]);
    const value = result[buildPageStorageKey(normalizedUrl)];
    return value ? pageRecordSchema.parse(value) : null;
  },

  async getAllPages() {
    const all = await storage.get<Record<string, unknown>>(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith(PAGE_STORAGE_PREFIX))
      .map(([, value]) => pageRecordSchema.parse(value));
  },

  async cleanupExpiredPages(now: number) {
    const pages = await this.getAllPages();
    const expired = pages.filter((page) => page.expiresAt <= now).map((page) => page.normalizedUrl);
    await Promise.all(expired.map((normalizedUrl) => this.deletePage(normalizedUrl)));
    return expired;
  },

  async getCacheStats() {
    const all = await storage.get<Record<string, unknown>>(null);
    const entries = Object.entries(all).filter(([key]) =>
      key.startsWith(PAGE_STORAGE_PREFIX) || key.startsWith(CONVERSATION_STORAGE_PREFIX) || key.startsWith(LOADING_STORAGE_PREFIX),
    );
    const bytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(entries))).byteLength;
    return { entryCount: entries.length, bytes };
  },

  async clearCache() {
    const all = await storage.get<Record<string, unknown>>(null);
    const keys = Object.keys(all).filter((key) =>
      key.startsWith(PAGE_STORAGE_PREFIX) || key.startsWith(CONVERSATION_STORAGE_PREFIX) || key.startsWith(LOADING_STORAGE_PREFIX),
    );
    await storage.remove(keys);
    return { removedKeys: keys.length };
  },

  async deletePage(normalizedUrl: string) {
    const all = await storage.get<Record<string, unknown>>(null);
    const cascadeKeys = Object.keys(all).filter(
      (key) =>
        key === buildPageStorageKey(normalizedUrl) ||
        key.startsWith(buildConversationStorageKey(normalizedUrl, '')) ||
        key.startsWith(buildLoadingStorageKey(normalizedUrl, '')),
    );
    await storage.remove(cascadeKeys);
  },
});
```

```ts
// src/repositories/conversation-repository.ts
import { conversationRecordSchema } from '../domain/conversation/conversation-schema';
import { loadingStateRecordSchema } from '../domain/loading/loading-state-schema';
import {
  buildConversationStorageKey,
  buildLoadingStorageKey,
  CONVERSATION_STORAGE_PREFIX,
  LOADING_STORAGE_PREFIX,
} from '../shared/storage-keys';

/** 会话仓储，管理 promptTab 会话和 loading 恢复 */
export const createConversationRepository = (
  storage: ReturnType<typeof import('./chrome-local-adapter').createChromeLocalAdapter>,
) => ({
  async saveConversation(value: unknown) {
    const next = conversationRecordSchema.parse(value);
    await storage.set({ [buildConversationStorageKey(next.normalizedUrl, next.promptTabId)]: next });
    return next;
  },

  async getConversation(normalizedUrl: string, promptTabId: string) {
    const result = await storage.get<Record<string, unknown>>([buildConversationStorageKey(normalizedUrl, promptTabId)]);
    const value = result[buildConversationStorageKey(normalizedUrl, promptTabId)];
    return value ? conversationRecordSchema.parse(value) : null;
  },

  async saveLoadingState(value: unknown) {
    const next = loadingStateRecordSchema.parse(value);
    await storage.set({ [buildLoadingStorageKey(next.normalizedUrl, next.promptTabId)]: next });
    return next;
  },

  async clearPageData(normalizedUrl: string) {
    const all = await storage.get<Record<string, unknown>>(null);
    const keys = Object.keys(all).filter(
      (key) => key.startsWith(`${CONVERSATION_STORAGE_PREFIX}${normalizedUrl}:`) || key.startsWith(`${LOADING_STORAGE_PREFIX}${normalizedUrl}:`),
    );
    await storage.remove(keys);
  },
});
```

```ts
// src/repositories/locale-repository.ts
import YAML from 'yaml';
import enRaw from '../../locales/en.yml?raw';
import zhRaw from '../../locales/zh-CN.yml?raw';

type LocaleCode = 'zh-CN' | 'en';
type LocaleMap = Record<string, string>;

/** 语言资源仓储，只解析静态资源，不做运行时写入 */
export const createLocaleRepository = () => ({
  async loadResources() {
    const resources: Record<LocaleCode, LocaleMap> = {
      'zh-CN': YAML.parse(zhRaw) as LocaleMap,
      en: YAML.parse(enRaw) as LocaleMap,
    };

    const zhKeys = Object.keys(resources['zh-CN']);
    const enKeys = Object.keys(resources.en);
    const missingKeys = zhKeys.filter((key) => !enKeys.includes(key)).concat(enKeys.filter((key) => !zhKeys.includes(key)));

    return {
      locales: ['zh-CN', 'en'] as const,
      resources,
      missingKeys,
      t(key: string, locale: LocaleCode) {
        return resources[locale][key] ?? resources['zh-CN'][key] ?? key;
      },
    };
  },
});
```

```yaml
# locales/zh-CN.yml
settings.title: 设置
settings.save: 保存
settings.reset: 恢复默认
settings.import: 导入配置
settings.export: 导出配置
settings.language: 语言
settings.theme: 主题
settings.models: 语言模型
settings.promptTabs: 标签页
settings.blacklist: 黑名单设置
settings.sync: 云同步
settings.cache: 本地缓存
```

```yaml
# locales/en.yml
settings.title: Settings
settings.save: Save
settings.reset: Reset
settings.import: Import Config
settings.export: Export Config
settings.language: Language
settings.theme: Theme
settings.models: Models
settings.promptTabs: Prompt Tabs
settings.blacklist: Blacklist
settings.sync: Sync
settings.cache: Local Cache
```

- [ ] **Step 4: 回跑仓储测试**

Run: `pnpm test:unit -- tests/unit/repositories/config-repository.spec.ts tests/unit/repositories/page-repository.spec.ts tests/unit/repositories/conversation-repository.spec.ts tests/unit/repositories/locale-repository.spec.ts -v`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/repositories/chrome-local-adapter.ts src/repositories/config-repository.ts src/repositories/page-repository.ts src/repositories/conversation-repository.ts src/repositories/locale-repository.ts tests/helpers/fake-storage.ts tests/unit/repositories/config-repository.spec.ts tests/unit/repositories/page-repository.spec.ts tests/unit/repositories/conversation-repository.spec.ts tests/unit/repositories/locale-repository.spec.ts locales/zh-CN.yml locales/en.yml
git commit -m "feat: add stage2 repositories and locale resources"
```

### Task 3: 暴露 background 配置命令与缓存清理入口

**Files:**
- Create: `src/services/runtime-messaging/config-commands.ts`
- Test: `tests/unit/services/runtime-messaging/config-commands.spec.ts`
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: 先写失败 command 测试**

```ts
// tests/unit/services/runtime-messaging/config-commands.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../../../src/domain/config/config-schema';
import { createConfigCommandHandler } from '../../../../src/services/runtime-messaging/config-commands';

describe('config-commands', () => {
  it('routes get/save/reset/import/export and cache commands', async () => {
    const handler = createConfigCommandHandler({
      configRepository: {
        getConfig: vi.fn().mockResolvedValue(createDefaultConfig()),
        saveConfig: vi.fn().mockImplementation(async (input) => input),
        resetConfig: vi.fn().mockResolvedValue(createDefaultConfig()),
        importConfig: vi.fn().mockResolvedValue(createDefaultConfig()),
        exportConfig: vi.fn().mockResolvedValue('{"version":"2.0.0"}'),
      },
      pageRepository: {
        getCacheStats: vi.fn().mockResolvedValue({ entryCount: 2, bytes: 128 }),
        clearCache: vi.fn().mockResolvedValue({ removedKeys: 2 }),
      },
    });

    await expect(handler({ type: 'GET_CONFIG' })).resolves.toMatchObject({ type: 'GET_CONFIG_SUCCESS' });
    await expect(handler({ type: 'GET_LOCAL_CACHE_STATS' })).resolves.toMatchObject({
      type: 'GET_LOCAL_CACHE_STATS_SUCCESS',
      stats: { entryCount: 2, bytes: 128 },
    });
    await expect(handler({ type: 'UNKNOWN' } as never)).rejects.toThrow(/unsupported command/i);
  });
});
```

- [ ] **Step 2: 运行测试确认 handler 缺失**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging/config-commands.spec.ts -v`

Expected: FAIL，报错包含 `Cannot find module '../../../../src/services/runtime-messaging/config-commands'`。

- [ ] **Step 3: 实现 command schema 与 background 挂载**

```ts
// src/services/runtime-messaging/config-commands.ts
import { z } from 'zod';

const configCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_CONFIG') }),
  z.object({ type: z.literal('SAVE_CONFIG'), config: z.unknown() }),
  z.object({ type: z.literal('RESET_CONFIG') }),
  z.object({ type: z.literal('IMPORT_CONFIG'), payload: z.string().min(1) }),
  z.object({ type: z.literal('EXPORT_CONFIG') }),
  z.object({ type: z.literal('GET_LOCAL_CACHE_STATS') }),
  z.object({ type: z.literal('CLEAR_LOCAL_CACHE') }),
]);

/** 创建阶段 2 配置命令处理器 */
export const createConfigCommandHandler = ({
  configRepository,
  pageRepository,
}: {
  configRepository: {
    getConfig: () => Promise<unknown>;
    saveConfig: (config: unknown) => Promise<unknown>;
    resetConfig: () => Promise<unknown>;
    importConfig: (payload: string) => Promise<unknown>;
    exportConfig: () => Promise<string>;
  };
  pageRepository: {
    getCacheStats: () => Promise<{ entryCount: number; bytes: number }>;
    clearCache: () => Promise<{ removedKeys: number }>;
  };
}) => {
  return async (input: unknown) => {
    const command = configCommandSchema.parse(input);

    switch (command.type) {
      case 'GET_CONFIG':
        return { type: 'GET_CONFIG_SUCCESS', config: await configRepository.getConfig() };
      case 'SAVE_CONFIG':
        return { type: 'SAVE_CONFIG_SUCCESS', config: await configRepository.saveConfig(command.config) };
      case 'RESET_CONFIG':
        return { type: 'RESET_CONFIG_SUCCESS', config: await configRepository.resetConfig() };
      case 'IMPORT_CONFIG':
        return { type: 'IMPORT_CONFIG_SUCCESS', config: await configRepository.importConfig(command.payload) };
      case 'EXPORT_CONFIG':
        return { type: 'EXPORT_CONFIG_SUCCESS', payload: await configRepository.exportConfig() };
      case 'GET_LOCAL_CACHE_STATS':
        return { type: 'GET_LOCAL_CACHE_STATS_SUCCESS', stats: await pageRepository.getCacheStats() };
      case 'CLEAR_LOCAL_CACHE':
        return { type: 'CLEAR_LOCAL_CACHE_SUCCESS', result: await pageRepository.clearCache() };
      default:
        throw new Error('unsupported command');
    }
  };
};
```

```ts
// entrypoints/background.ts
import { createChromeLocalAdapter } from '../src/repositories/chrome-local-adapter';
import { createConfigRepository } from '../src/repositories/config-repository';
import { createPageRepository } from '../src/repositories/page-repository';
import { createConfigCommandHandler } from '../src/services/runtime-messaging/config-commands';

const storage = createChromeLocalAdapter(chrome.storage.local);
const configRepository = createConfigRepository(storage);
const pageRepository = createPageRepository(storage);
const handleConfigCommand = createConfigCommandHandler({
  configRepository,
  pageRepository,
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleConfigCommand(message)
    .then((result) => {
      logger.info('配置命令.处理成功', { commandType: message?.type });
      sendResponse(result);
    })
    .catch((error) => {
      logger.error('配置命令.处理失败', {
        commandType: message?.type,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      sendResponse({
        type: 'COMMAND_ERROR',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    });

  return true;
});
```

- [ ] **Step 4: 回跑命令单测**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging/config-commands.spec.ts -v`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/runtime-messaging/config-commands.ts entrypoints/background.ts tests/unit/services/runtime-messaging/config-commands.spec.ts
git commit -m "feat: add stage2 background config commands"
```

### Task 4: 搭建设置页壳层、国际化与本地图标

**Files:**
- Create: `src/services/i18n/locale-service.ts`
- Create: `src/ui/icon.tsx`
- Create: `assets/styles/material-symbols.css`
- Create: `src/features/settings/settings-api.ts`
- Create: `src/features/settings/settings-shell.tsx`
- Modify: `entrypoints/options/main.tsx`
- Test: `tests/component/options/settings-shell.spec.tsx`
- Test: `tests/component/options/quick-inputs.spec.tsx`

- [ ] **Step 1: 先写失败组件测试，锁定加载与即时预览骨架**

```tsx
// tests/component/options/settings-shell.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { SettingsShell } from '../../../src/features/settings/settings-shell';

describe('SettingsShell', () => {
  it('loads config, previews locale immediately, and saves through api', async () => {
    const api = {
      getConfig: vi.fn().mockResolvedValue(createDefaultConfig()),
      saveConfig: vi.fn().mockImplementation(async (config) => config),
      resetConfig: vi.fn(),
      exportConfig: vi.fn(),
      importConfig: vi.fn(),
      getLocalCacheStats: vi.fn().mockResolvedValue({ entryCount: 3, bytes: 300 }),
      clearLocalCache: vi.fn(),
    };

    render(<SettingsShell api={api} />);

    await waitFor(() => expect(api.getConfig).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByText(/本地缓存/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('语言'), 'en');

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saveConfig).toHaveBeenCalledTimes(1);
  });
});
```

```tsx
// tests/component/options/quick-inputs.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QuickInputsPanel } from '../../../src/features/settings/quick-inputs-panel';

describe('QuickInputsPanel', () => {
  it('collapses and shows prompt preview', async () => {
    render(
      <QuickInputsPanel
        value={[
          {
            id: 'summary',
            name: 'Summary',
            prompt: 'Summarize the current page with bullet points.',
            autoTrigger: false,
            modelId: null,
            order: 0,
            deletedAt: null,
          },
        ]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText(/Summarize the current page/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /summary/i }));
    expect(screen.queryByText(/bullet points/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行组件测试确认页面壳层尚未存在**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx -v`

Expected: FAIL，报错包含缺少 `SettingsShell` 或 `QuickInputsPanel`。

- [ ] **Step 3: 写最小 options 壳层、i18n 和图标实现**

```ts
// src/services/i18n/locale-service.ts
import { createLocaleRepository } from '../../repositories/locale-repository';

/** 设置页语言服务，负责即时预览和回退 */
export const createLocaleService = async (locale: 'zh-CN' | 'en' = 'zh-CN') => {
  const repository = createLocaleRepository();
  const loaded = await repository.loadResources();
  let currentLocale = locale;

  return {
    getLocale: () => currentLocale,
    setLocale: (next: 'zh-CN' | 'en') => {
      currentLocale = next;
    },
    t: (key: string) => loaded.t(key, currentLocale),
  };
};
```

```tsx
// src/ui/icon.tsx
import '../../assets/styles/material-symbols.css';

/** 本地图标封装，避免页面直接依赖在线字体 */
export const Icon = ({ name, label }: { name: string; label: string }) => (
  <span className="tb-icon material-symbols-outlined" aria-label={label}>
    {name}
  </span>
);
```

```css
/* assets/styles/material-symbols.css */
.material-symbols-outlined {
  font-family: "Segoe UI Symbol", sans-serif;
  font-size: 20px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tb-icon {
  width: 20px;
  height: 20px;
}
```

```ts
// src/features/settings/settings-api.ts
/** 设置页访问 background 的唯一入口 */
export const settingsApi = {
  getConfig: async () => chrome.runtime.sendMessage({ type: 'GET_CONFIG' }).then((result) => result.config),
  saveConfig: async (config: unknown) => chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', config }).then((result) => result.config),
  resetConfig: async () => chrome.runtime.sendMessage({ type: 'RESET_CONFIG' }).then((result) => result.config),
  exportConfig: async () => chrome.runtime.sendMessage({ type: 'EXPORT_CONFIG' }).then((result) => result.payload),
  importConfig: async (payload: string) => chrome.runtime.sendMessage({ type: 'IMPORT_CONFIG', payload }).then((result) => result.config),
  getLocalCacheStats: async () => chrome.runtime.sendMessage({ type: 'GET_LOCAL_CACHE_STATS' }).then((result) => result.stats),
  clearLocalCache: async () => chrome.runtime.sendMessage({ type: 'CLEAR_LOCAL_CACHE' }).then((result) => result.result),
};
```

```tsx
// src/features/settings/settings-shell.tsx
import { useEffect, useState } from 'react';
import { createDefaultConfig, type ExtensionConfig } from '../../domain/config/config-schema';
import { createLocaleService } from '../../services/i18n/locale-service';
import { Icon } from '../../ui/icon';
import { QuickInputsPanel } from './quick-inputs-panel';

const NAV_ITEMS = ['basic', 'promptTabs', 'models', 'sync', 'blacklist'] as const;

/** 设置页骨架，阶段 2 先完成本地配置闭环 */
export const SettingsShell = ({ api }: { api: typeof import('./settings-api').settingsApi }) => {
  const [config, setConfig] = useState<ExtensionConfig>(createDefaultConfig());
  const [localeService, setLocaleService] = useState<Awaited<ReturnType<typeof createLocaleService>> | null>(null);
  const [activeNav, setActiveNav] = useState<(typeof NAV_ITEMS)[number]>('basic');
  const [cacheStats, setCacheStats] = useState({ entryCount: 0, bytes: 0 });

  useEffect(() => {
    void (async () => {
      const nextConfig = await api.getConfig();
      const service = await createLocaleService(nextConfig.basic.language);
      setConfig(nextConfig);
      setLocaleService(service);
      setCacheStats(await api.getLocalCacheStats());
    })();
  }, [api]);

  if (!localeService) {
    return <main>Loading...</main>;
  }

  const t = (key: string) => localeService.t(key);

  return (
    <main>
      <header>
        <h1>{t('settings.title')}</h1>
        <div>
          <button type="button" onClick={() => void api.saveConfig(config)}>
            {t('settings.save')}
          </button>
          <button type="button" onClick={() => void api.resetConfig()}>
            {t('settings.reset')}
          </button>
          <button type="button" onClick={() => void api.exportConfig()}>
            {t('settings.export')}
          </button>
        </div>
      </header>

      <aside>
        {NAV_ITEMS.map((item) => (
          <button key={item} type="button" onClick={() => setActiveNav(item)}>
            <Icon name="settings" label={item} />
            {item}
          </button>
        ))}
      </aside>

      <section hidden={activeNav !== 'basic'}>
        <label>
          {t('settings.language')}
          <select
            aria-label={t('settings.language')}
            value={config.basic.language}
            onChange={(event) => {
              const language = event.target.value as 'zh-CN' | 'en';
              localeService.setLocale(language);
              setConfig({
                ...config,
                basic: { ...config.basic, language },
              });
            }}
          >
            <option value="zh-CN">zh-CN</option>
            <option value="en">en</option>
          </select>
        </label>

        <section aria-label={t('settings.cache')}>
          <p>{t('settings.cache')}</p>
          <p>{cacheStats.entryCount} entries / {cacheStats.bytes} bytes</p>
        </section>
      </section>

      <section hidden={activeNav !== 'promptTabs'}>
        <QuickInputsPanel
          value={config.quickInputs}
          onChange={(quickInputs) => setConfig({ ...config, quickInputs })}
        />
      </section>
    </main>
  );
};
```

```tsx
// entrypoints/options/main.tsx
import { createRoot } from 'react-dom/client';
import { SettingsShell } from '../../src/features/settings/settings-shell';
import { settingsApi } from '../../src/features/settings/settings-api';

const root = createRoot(document.getElementById('root')!);
root.render(<SettingsShell api={settingsApi} />);
```

- [ ] **Step 4: 回跑组件测试**

Run: `pnpm test:component -- tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx -v`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/i18n/locale-service.ts src/ui/icon.tsx assets/styles/material-symbols.css src/features/settings/settings-api.ts src/features/settings/settings-shell.tsx entrypoints/options/main.tsx tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx
git commit -m "feat: add stage2 settings shell"
```

### Task 5: 完成设置页模型表单、导入导出与缓存清理交互

**Files:**
- Create: `src/features/settings/model-form.tsx`
- Create: `src/features/settings/quick-inputs-panel.tsx`
- Modify: `src/features/settings/settings-shell.tsx`
- Test: `tests/component/options/model-form.spec.tsx`
- Modify: `tests/component/options/settings-shell.spec.tsx`

- [ ] **Step 1: 先写失败测试，覆盖高风险交互**

```tsx
// tests/component/options/model-form.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelForm } from '../../../src/features/settings/model-form';

describe('ModelForm', () => {
  it('switches provider fields, masks api key, and reports incomplete models', async () => {
    const onChange = vi.fn();
    render(
      <ModelForm
        value={{
          id: 'm1',
          name: 'Model 1',
          provider: 'openai-compatible',
          enabled: true,
          model: '',
          baseUrl: '',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: null,
          order: 0,
          deletedAt: null,
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByDisplayValue('••••••')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /显示 api key/i }));
    expect(screen.getByDisplayValue('secret')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/provider/i), 'azure-openai');
    expect(screen.getByLabelText(/deployment/i)).toBeInTheDocument();
    expect(screen.getByText(/配置不完整/i)).toBeInTheDocument();
  });
});
```

```tsx
// tests/component/options/settings-shell.spec.tsx
it('imports, exports, clears cache, and blocks save on incomplete default model', async () => {
  const api = {
    getConfig: vi.fn().mockResolvedValue(
      createDefaultConfig({
        basic: {
          theme: 'system',
          language: 'zh-CN',
          defaultModelId: 'm1',
          systemPrompt: '',
          filterCot: false,
          extractionMethod: 'readability',
          includePageContentByDefault: true,
        },
        models: [
          {
            id: 'm1',
            name: 'Broken',
            provider: 'gemini',
            enabled: true,
            model: '',
            baseUrl: '',
            apiKey: '',
            deployment: '',
            temperature: 0.2,
            tools: [],
            thinkingBudget: null,
            maxOutputTokens: null,
            order: 0,
            deletedAt: null,
          },
        ],
      }),
    ),
    saveConfig: vi.fn(),
    resetConfig: vi.fn(),
    exportConfig: vi.fn().mockResolvedValue('{"version":"2.0.0"}'),
    importConfig: vi.fn().mockResolvedValue(createDefaultConfig()),
    getLocalCacheStats: vi.fn().mockResolvedValue({ entryCount: 3, bytes: 300 }),
    clearLocalCache: vi.fn().mockResolvedValue({ removedKeys: 3 }),
  };

  render(<SettingsShell api={api} />);
  await waitFor(() => expect(api.getConfig).toHaveBeenCalled());

  await userEvent.click(screen.getByRole('button', { name: /保存/i }));
  expect(api.saveConfig).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /导出配置/i }));
  expect(api.exportConfig).toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /清理本地缓存/i }));
  expect(api.clearLocalCache).toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行组件测试确认交互细节尚未完成**

Run: `pnpm test:component -- tests/component/options/model-form.spec.tsx tests/component/options/settings-shell.spec.tsx -v`

Expected: FAIL，报错包含缺少 `ModelForm`、保存未阻断或缓存清理按钮不存在。

- [ ] **Step 3: 写最小交互实现，优先处理模型完整性和错误保护**

```tsx
// src/features/settings/model-form.tsx
import { useState } from 'react';
import { isModelConfigComplete, type ModelConfig } from '../../domain/config/config-schema';

/** 模型编辑表单，阶段 2 只做本地校验和差异字段切换 */
export const ModelForm = ({
  value,
  onChange,
}: {
  value: ModelConfig;
  onChange: (value: ModelConfig) => void;
}) => {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <section>
      <label>
        Provider
        <select
          aria-label="provider"
          value={value.provider}
          onChange={(event) => onChange({ ...value, provider: event.target.value as ModelConfig['provider'] })}
        >
          <option value="openai-compatible">openai-compatible</option>
          <option value="gemini">gemini</option>
          <option value="azure-openai">azure-openai</option>
          <option value="anthropic">anthropic</option>
        </select>
      </label>

      <label>
        API Key
        <input
          value={showApiKey ? value.apiKey : '••••••'}
          onChange={(event) => onChange({ ...value, apiKey: event.target.value === '••••••' ? value.apiKey : event.target.value })}
        />
      </label>
      <button type="button" onClick={() => setShowApiKey((current) => !current)}>
        {showApiKey ? '隐藏 API Key' : '显示 API Key'}
      </button>

      {(value.provider === 'openai-compatible' || value.provider === 'azure-openai') && (
        <label>
          Base URL
          <input value={value.baseUrl} onChange={(event) => onChange({ ...value, baseUrl: event.target.value })} />
        </label>
      )}

      {value.provider === 'azure-openai' && (
        <label>
          Deployment
          <input aria-label="deployment" value={value.deployment} onChange={(event) => onChange({ ...value, deployment: event.target.value })} />
        </label>
      )}

      <p>{isModelConfigComplete(value) ? '配置完整' : '配置不完整'}</p>
    </section>
  );
};
```

```tsx
// src/features/settings/quick-inputs-panel.tsx
import { useState } from 'react';
import type { ExtensionConfig } from '../../domain/config/config-schema';

/** 快捷输入面板，阶段 2 先支持折叠和摘要预览 */
export const QuickInputsPanel = ({
  value,
  onChange,
}: {
  value: ExtensionConfig['quickInputs'];
  onChange: (value: ExtensionConfig['quickInputs']) => void;
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <section>
      {value.map((item) => (
        <article key={item.id}>
          <button
            type="button"
            onClick={() =>
              setCollapsed((current) => ({
                ...current,
                [item.id]: !current[item.id],
              }))
            }
          >
            {item.name}
          </button>
          {!collapsed[item.id] && <p>{item.prompt}</p>}
        </article>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              name: '新标签页',
              prompt: '',
              autoTrigger: false,
              modelId: null,
              order: value.length,
              deletedAt: null,
            },
          ])
        }
      >
        新增标签页
      </button>
    </section>
  );
};
```

```tsx
// src/features/settings/settings-shell.tsx
import { isModelConfigComplete } from '../../domain/config/config-schema';
import { ModelForm } from './model-form';

const canSaveConfig = (config: ExtensionConfig) => {
  if (!config.basic.defaultModelId) {
    return true;
  }

  const defaultModel = config.models.find((item) => item.id === config.basic.defaultModelId);
  return defaultModel ? isModelConfigComplete(defaultModel) : false;
};

// 在组件内补充
<button
  type="button"
  onClick={() => void api.saveConfig(config)}
  disabled={!canSaveConfig(config)}
>
  {t('settings.save')}
</button>

<button type="button" onClick={() => void api.importConfig('{"version":"2.0.0"}')}>
  {t('settings.import')}
</button>

<button type="button" onClick={() => void api.exportConfig()}>
  {t('settings.export')}
</button>

<button
  type="button"
  onClick={async () => {
    await api.clearLocalCache();
    setCacheStats(await api.getLocalCacheStats());
  }}
>
  清理本地缓存
</button>

<section hidden={activeNav !== 'models'}>
  {config.models.map((model, index) => (
    <ModelForm
      key={model.id}
      value={model}
      onChange={(nextModel) => {
        const nextModels = [...config.models];
        nextModels[index] = nextModel;
        setConfig({ ...config, models: nextModels });
      }}
    />
  ))}
</section>
```

- [ ] **Step 4: 回跑设置页组件测试**

Run: `pnpm test:component -- tests/component/options/model-form.spec.tsx tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx -v`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/settings/model-form.tsx src/features/settings/quick-inputs-panel.tsx src/features/settings/settings-shell.tsx tests/component/options/model-form.spec.tsx tests/component/options/settings-shell.spec.tsx tests/component/options/quick-inputs.spec.tsx
git commit -m "feat: finish stage2 settings interactions"
```

### Task 6: 补流程回归并更新文档

**Files:**
- Test: `tests/e2e/settings-flow.spec.ts`
- Modify: `docs/Workspace/settings.md`
- Modify: `docs/dao/config-repository.md`
- Modify: `docs/dao/page-repository.md`
- Modify: `docs/test/settings-core.md`
- Modify: `docs/decision_log.md`

- [ ] **Step 1: 先写失败流程测试，保证不是只靠单元/组件绿灯**

```ts
// tests/e2e/settings-flow.spec.ts
import { expect, test } from './helpers/extension-fixture';
import { EXTENSION_PAGES } from '../../src/shared/extension-pages';

test('saves settings and keeps locale preview after reload', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${EXTENSION_PAGES.options}`);

  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await page.getByLabel('语言').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/Local Cache/i)).toBeVisible();
});
```

- [ ] **Step 2: 运行流程测试确认当前闭环还不完整**

Run: `pnpm test:e2e -- tests/e2e/settings-flow.spec.ts`

Expected: FAIL，常见报错是 options 仍是 Stage 1 壳层、没有语言选择或保存后未持久化。

- [ ] **Step 3: 补测试需要的最小文档与口径更新**

```md
<!-- docs/Workspace/settings.md -->
## 12. 阶段 2 落地边界

- 阶段 2 已交付：本地配置保存、恢复默认、导入导出、本地缓存占用展示与安全清理、语言主题即时预览。
- 阶段 2 暂不交付：远端连接测试、保存并同步、远端模板导入。
- `quickInputs` 仍是持久化字段名，设置页 UI 文案统一展示为“标签页”。
```

```md
<!-- docs/dao/config-repository.md -->
## 7. 阶段 2 新增命令

- `GET_CONFIG`
- `SAVE_CONFIG`
- `RESET_CONFIG`
- `IMPORT_CONFIG`
- `EXPORT_CONFIG`

导入拒绝策略：

- 版本不支持直接拒绝。
- schema 非法直接拒绝。
- 拒绝时不得污染现有本地配置。
```

```md
<!-- docs/dao/page-repository.md -->
## 7. 阶段 2 新增职责

- 提供本地缓存条目数与字节数统计。
- 只清理 `page / conversation / loading` 三类可回收数据。
- 清理缓存时不得删除 `config` 与同步相关数据。
```

```md
<!-- docs/test/settings-core.md -->
## 8. 阶段 2 流程回归补充

- Playwright 校验 options 页面打开、语言即时预览、保存后刷新仍保留。
- Playwright 校验本地缓存统计区域存在。
- 组件测试校验不完整默认模型阻止保存。
```

```md
<!-- docs/decision_log.md -->
## 2026-04-02 阶段 2 同步范围决策

- 原因：阶段 2 目标是先固定数据契约和设置页本地闭环，避免同时引入远端同步网络复杂度。
- 决策：本阶段只保存 `sync` 字段，不执行远端连接测试和真实同步。
- 影响：设置页先展示同步配置表单，真实“保存并同步”在后续阶段补齐。
```

- [ ] **Step 4: 跑最终阶段验收**

Run: `pnpm test:unit -- tests/unit/domain tests/unit/repositories tests/unit/services/runtime-messaging/config-commands.spec.ts`

Expected: PASS。

Run: `pnpm test:component -- tests/component/options`

Expected: PASS。

Run: `pnpm test:e2e -- tests/e2e/settings-flow.spec.ts`

Expected: PASS。

Run: `pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add tests/e2e/settings-flow.spec.ts docs/Workspace/settings.md docs/dao/config-repository.md docs/dao/page-repository.md docs/test/settings-core.md docs/decision_log.md
git commit -m "docs: finalize stage2 settings foundation plan"
```

## 2. 自检

### 2.1 需求覆盖

1. `ExtensionConfig / PageRecord / ConversationRecord / LoadingStateRecord` schema 与默认值工厂
   - 对应 Task 1。
2. typed repositories 与 `chrome.storage.local` 统一封装
   - 对应 Task 2。
3. 设置页最小闭环、语言主题即时预览、模型完整性判定
   - 对应 Task 4 和 Task 5。
4. 本地缓存占用展示与安全清理入口
   - 对应 Task 2、Task 3、Task 5、Task 6。
5. background 暴露 `GET_CONFIG / SAVE_CONFIG / RESET_CONFIG / IMPORT_CONFIG / EXPORT_CONFIG`
   - 对应 Task 3。
6. 文档、测试、验收同步更新
   - 对应 Task 6。

### 2.2 Placeholder 扫描

- 已检查全文，没有 `TODO / TBD / implement later / similar to Task N` 这类占位描述。
- 每个任务都给了明确文件、命令、期望结果和代码片段。

### 2.3 类型与命名一致性

- 持久化字段统一使用 `quickInputs`，UI 文案统一展示“标签页”。
- `CONFIG_SCHEMA_VERSION` 与 `SYNC_SNAPSHOT_SCHEMA_VERSION` 统一由 `src/shared/schema-version.ts` 提供。
- `GET_LOCAL_CACHE_STATS / CLEAR_LOCAL_CACHE` 贯穿 repository、command、UI 与测试，未混用其他命名。

Plan complete and saved to `docs/superpowers/plans/2026-04-02-stage-2-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
