# 阶段 4 聊天主链路、流式恢复与日志 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通“side panel 发送文本/图片 -> background 调度模型 -> port 流式输出 -> 写入会话与 loading -> side panel 重开恢复”的最小可运行闭环。

**Architecture:** 保持 `background service worker` 作为唯一高权限协调层，`SidebarShell` 只负责发送命令、订阅 port 事件和展示恢复态；Provider 差异、会话增量写入、loading 生命周期都收口在 `llm-dispatch` 与 `conversation-repository`。本阶段只交付 `Chat` 主回答流式与可见恢复，不提前实现阶段 5 的分支并发、编辑、重试和快捷输入自动触发，但数据结构和消息契约必须为后续扩展留好边界。

**Tech Stack:** WXT、Chrome MV3、React 18、TypeScript Strict Mode、Zod、Vitest、React Testing Library、Playwright、Vercel AI SDK Core、Tailwind CSS v4、shadcn/ui

---

## 复核结论（2026-04-03）

- 已有能力：
  - 阶段 3 已完成 `GET_SIDEBAR_BOOTSTRAP`、页面提取、黑名单确认、`sidebar.html` 入口与最小 `port-bus` 骨架。
  - `ConversationRecord` 与 `LoadingStateRecord` 已有 schema，但仓储只支持“整条保存/按页列出”，还不支持聊天增量写入。
  - `SidebarShell` 目前只有提取区和 `Chat` 占位，没有输入区、消息区、port 订阅和 loading 恢复。
- 缺失能力：
  - 仓库还没有 `src/services/llm-dispatch/*` 代码。
  - `package.json` 还没接入 `ai` 与各 Provider adapter。
  - 模型配置没有显式图片能力字段，若按模型名猜测会污染业务协议。
  - `background` 还没接 `chrome.runtime.onConnect`，流式恢复链路不存在。
- 本计划采用的阶段 4 恢复定义：
  - “恢复”指恢复用户可见状态：已落盘的用户消息、助手部分内容、loading 锚点和取消/错误态。
  - 不承诺在 service worker 被浏览器回收后继续同一远端流式请求；若需要“跨重启继续跑同一请求”，那是阶段外的 durable job 设计，执行前需单独确认。

## File Structure

### 新建文件

- `src/services/llm-dispatch/provider-registry.ts`
  - 统一解析 4 类 Provider，返回可调用模型、显示名和显式能力。
- `src/services/llm-dispatch/chat-dispatch-service.ts`
  - 组装 `ChatRequestContext`、驱动 `streamText`、维护 `StreamSession` 生命周期、写会话与 loading、推送 port 事件。
- `src/features/sidebar/chat-input.tsx`
  - 输入区：文本、图片预览、模型选择、发送、停止、导出。
- `src/features/sidebar/chat-thread.tsx`
  - 聊天区：用户消息、助手消息、loading 恢复态、错误态。
- `tests/unit/services/llm-dispatch/provider-registry.spec.ts`
  - Provider registry 契约测试。
- `tests/unit/services/llm-dispatch/session-lifecycle.spec.ts`
  - `StreamSession` 生命周期、取消、错误回收测试。
- `tests/unit/repositories/conversation-editing.spec.ts`
  - 主消息增量写入与 loading 恢复查询测试。
- `tests/component/sidebar/chat-input.spec.tsx`
  - 输入区文本、图片、禁用态和发送前校验测试。
- `tests/component/sidebar/loading-restore.spec.tsx`
  - side panel 重开后的 loading 恢复展示测试。
- `tests/component/sidebar/export-guard.spec.tsx`
  - 空会话不导出空文件测试。
- `tests/e2e/sidebar-chat.spec.ts`
  - 文本发送、首包流式、完成写历史、关闭重开恢复 E2E。
- `tests/e2e/service-worker-recovery.spec.ts`
  - 模拟 worker 重启后的重新订阅与持久化恢复 E2E。

### 修改文件

- `package.json`
  - 增加 `ai`、`@ai-sdk/openai-compatible`、`@ai-sdk/google`、`@ai-sdk/anthropic` 依赖。
- `src/domain/config/config-schema.ts`
  - 给模型配置增加显式 `supportsImages` 能力字段。
- `src/features/settings/model-form.tsx`
  - 设置页模型表单增加“支持图片输入”开关。
- `src/repositories/config-repository.ts`
  - 增加按 `modelId` 获取完整模型配置的方法，避免调度层自己扫配置。
- `src/repositories/conversation-repository.ts`
  - 增加用户消息追加、助手占位、chunk 增量写入、完成/错误收口、单 `promptTab` loading 读写与清理。
- `src/services/runtime-messaging/sidebar-contract.ts`
  - 增加 `SEND_CHAT`、`STOP_SESSION`、`EXPORT_CONVERSATION` 命令与 `STREAM_* / LOADING_STATE_UPDATE / RESTORE_LOADING` port 事件 schema。
- `src/services/runtime-messaging/sidebar-commands.ts`
  - 注入 chat dispatch、导出和 sender 校验。
- `src/services/runtime-messaging/port-bus.ts`
  - 从“单名字 port 记录”升级为“可订阅 promptTab 的端口总线”。
- `entrypoints/background.ts`
  - 组装 provider registry、chat dispatch、port `onConnect` 和 sidebar 命令处理。
- `src/features/sidebar/sidebar-api.ts`
  - 增加 `sendChat`、`stopSession`、`exportConversation` 和 `connectStream`。
- `src/features/sidebar/sidebar-shell.tsx`
  - 接入真实聊天区、输入区、port 订阅、恢复态与最小导出。
- `entrypoints/sidebar/main.tsx`
  - 保证 `SidebarApi` 与 port 连接只初始化一次，避免重复订阅。
- `src/services/logger/logger.ts`
  - 扩展敏感字段过滤，补阶段 4 事件契约。
- `tests/unit/domain/config-schema.spec.ts`
- `tests/component/options/model-form.spec.tsx`
- `tests/unit/services/runtime-messaging.spec.ts`
- `tests/unit/services/logger/logger.spec.ts`
  - 同步阶段 4 契约。
- `docs/Services/llm-dispatch.md`
- `docs/Services/runtime-messaging.md`
- `docs/Services/logger.md`
- `docs/DataSchema/conversation.md`
- `docs/DataSchema/loading-state.md`
- `docs/dao/conversation-repository.md`
- `docs/Workspace/sidebar.md`
- `docs/Workspace/settings.md`
- `docs/flow.md`
- `docs/test/llm-and-streaming.md`
- `docs/test/sidebar-core.md`
  - 同步阶段 4 的能力边界、恢复定义、测试口径和日志事件。

## 实施约束

- 只做 `Chat` 主回答流式闭环，不提前实现阶段 5 的分支并发、编辑、重试与快捷输入自动触发。
- 图片能力必须显式建模为 `supportsImages`，不允许根据 `provider + model` 字符串猜测。
- `content script` 不接触 API Key、Provider SDK、会话持久化。
- 每个 chunk 都要先落 `ConversationRecord`，再推 port 事件，避免 UI 比持久化状态更“新”。
- side panel 关闭、port 断开、worker 重启后，恢复依据只能来自 `ConversationRecord` 与 `LoadingStateRecord`，不能依赖内存态。
- 本阶段导出只要求“非空会话可导出、空会话明确失败”，Markdown 结构先覆盖主链路，分支富格式放到阶段 5 扩展。
- 关键日志只带 `browserTabId`、`normalizedUrl`、`promptTab`、`sessionId`、`messageId`、`provider` 等关联字段，不记录正文、图片原始内容或 API Key。

### Task 1: 显式建模模型图片能力

**Files:**
- Modify: `src/domain/config/config-schema.ts`
- Modify: `src/features/settings/model-form.tsx`
- Modify: `tests/unit/domain/config-schema.spec.ts`
- Modify: `tests/component/options/model-form.spec.tsx`

- [ ] **Step 1: 先写失败测试，锁定 `supportsImages` 必须显式存在**

```ts
// tests/unit/domain/config-schema.spec.ts
it('模型图片能力必须显式建模，不能靠模型名猜测', () => {
  const config = createDefaultConfig({
    models: [
      {
        id: 'vision-model',
        name: 'Vision',
        provider: 'openai-compatible',
        enabled: true,
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.example.com',
        apiKey: 'secret',
        deployment: '',
        temperature: 0.2,
        tools: [],
        thinkingBudget: null,
        maxOutputTokens: null,
        supportsImages: true,
        order: 0,
        deletedAt: null,
      },
    ],
  });

  expect(extensionConfigSchema.parse(config).models[0]?.supportsImages).toBe(true);
});
```

```tsx
// tests/component/options/model-form.spec.tsx
it('允许显式切换图片输入能力', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  const Harness = () => {
    const [model, setModel] = useState(
      createModel({
        supportsImages: false,
      }),
    );
    return (
      <ModelForm
        model={model}
        onChange={(nextModel) => {
          onChange(nextModel);
          setModel(nextModel);
        }}
      />
    );
  };

  render(<Harness />);

  const checkbox = screen.getByRole('checkbox', { name: '支持图片输入' });
  expect(checkbox).not.toBeChecked();

  await user.click(checkbox);

  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      supportsImages: true,
    }),
  );
});
```

- [ ] **Step 2: 运行测试，确认当前 schema 与表单都缺字段**

Run: `pnpm test:unit -- tests/unit/domain/config-schema.spec.ts -v`

Expected: FAIL，提示 `supportsImages` 不在 `ModelConfig` 上。

Run: `pnpm test:component -- tests/component/options/model-form.spec.tsx -v`

Expected: FAIL，提示找不到“支持图片输入”复选框。

- [ ] **Step 3: 写最小实现，把图片能力变成显式协议**

```ts
// src/domain/config/config-schema.ts
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
    temperature: z.number(),
    tools: z.array(z.string()),
    thinkingBudget: z.number().int().nonnegative().nullable(),
    maxOutputTokens: z.number().int().positive().nullable(),
    supportsImages: z.boolean(),
    order: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().nullable(),
  })
  .superRefine((value, ctx) => {
    const requiredFields: Record<string, Array<'baseUrl' | 'apiKey' | 'model' | 'deployment'>> = {
      'openai-compatible': ['baseUrl', 'apiKey', 'model'],
      gemini: ['apiKey', 'model'],
      'azure-openai': ['baseUrl', 'apiKey', 'deployment'],
      anthropic: ['apiKey', 'model'],
    };

    for (const field of requiredFields[value.provider]) {
      if (!value[field].trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${value.provider} provider field ${field} is required`,
          path: [field],
        });
      }
    }
  });
```

```tsx
// src/features/settings/model-form.tsx
<label className="flex items-center gap-2">
  <input
    aria-label="支持图片输入"
    type="checkbox"
    checked={model.supportsImages}
    disabled={disabled}
    onChange={(event) => updateModel({ supportsImages: event.target.checked })}
  />
  <span className="text-sm font-medium">支持图片输入</span>
</label>
```

- [ ] **Step 4: 重新跑测试，确认能力字段和设置页收口成功**

Run: `pnpm test:unit -- tests/unit/domain/config-schema.spec.ts -v`

Expected: PASS

Run: `pnpm test:component -- tests/component/options/model-form.spec.tsx -v`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/domain/config/config-schema.ts src/features/settings/model-form.tsx tests/unit/domain/config-schema.spec.ts tests/component/options/model-form.spec.tsx
git commit -m "feat: model explicit image capability"
```

### Task 2: 锁定 Provider Registry 与模型解析契约

**Files:**
- Modify: `package.json`
- Create: `src/services/llm-dispatch/provider-registry.ts`
- Create: `tests/unit/services/llm-dispatch/provider-registry.spec.ts`
- Modify: `src/repositories/config-repository.ts`

- [ ] **Step 1: 先写失败单测，锁定 4 类 Provider 解析与能力输出**

```ts
// tests/unit/services/llm-dispatch/provider-registry.spec.ts
import { describe, expect, it, vi } from 'vitest';

import { createProviderRegistry } from '../../../../src/services/llm-dispatch/provider-registry';

const baseModel = {
  id: 'model-1',
  name: '主模型',
  enabled: true,
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.example.com',
  apiKey: 'secret',
  deployment: '',
  temperature: 0.2,
  tools: [],
  thinkingBudget: null,
  maxOutputTokens: 512,
  supportsImages: true,
  order: 0,
  deletedAt: null,
} as const;

describe('provider-registry', () => {
  it('解析 openai-compatible 与 azure-openai', () => {
    const openaiCompatibleFactory = vi.fn(() => ({ provider: 'openai-compatible-client' }));
    const registry = createProviderRegistry({
      openaiCompatibleFactory,
      googleFactory: vi.fn(),
      anthropicFactory: vi.fn(),
    });

    const openai = registry.resolveModel({ ...baseModel, provider: 'openai-compatible' });
    const azure = registry.resolveModel({
      ...baseModel,
      provider: 'azure-openai',
      deployment: 'gpt-4o-mini',
    });

    expect(openai.providerId).toBe('openai-compatible');
    expect(azure.providerId).toBe('azure-openai');
    expect(openai.supportsImages).toBe(true);
    expect(openaiCompatibleFactory).toHaveBeenCalledTimes(2);
  });

  it('解析 gemini 与 anthropic', () => {
    const googleFactory = vi.fn(() => ({ provider: 'google-client' }));
    const anthropicFactory = vi.fn(() => ({ provider: 'anthropic-client' }));
    const registry = createProviderRegistry({
      openaiCompatibleFactory: vi.fn(),
      googleFactory,
      anthropicFactory,
    });

    expect(registry.resolveModel({ ...baseModel, provider: 'gemini' }).providerId).toBe('gemini');
    expect(registry.resolveModel({ ...baseModel, provider: 'anthropic' }).providerId).toBe('anthropic');
    expect(googleFactory).toHaveBeenCalledTimes(1);
    expect(anthropicFactory).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认当前仓库还没有 registry**

Run: `pnpm test:unit -- tests/unit/services/llm-dispatch/provider-registry.spec.ts -v`

Expected: FAIL，提示缺少 `provider-registry.ts` 或 `createProviderRegistry`。

- [ ] **Step 3: 写最小实现，并给配置仓储补 `getModelById`**

```ts
// src/services/llm-dispatch/provider-registry.ts
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import type { ModelConfig } from '../../domain/config/config-schema';

type ProviderRegistryDependencies = {
  openaiCompatibleFactory?: typeof createOpenAICompatible;
  googleFactory?: typeof google;
  anthropicFactory?: typeof anthropic;
};

export const createProviderRegistry = ({
  openaiCompatibleFactory = createOpenAICompatible,
  googleFactory = google,
  anthropicFactory = anthropic,
}: ProviderRegistryDependencies = {}) => ({
  resolveModel(model: ModelConfig) {
    if (model.provider === 'openai-compatible') {
      return {
        providerId: 'openai-compatible' as const,
        modelId: model.model,
        modelLabel: model.name,
        supportsImages: model.supportsImages,
        sdkModel: openaiCompatibleFactory({
          name: model.name,
          apiKey: model.apiKey,
          baseURL: model.baseUrl,
        })(model.model),
      };
    }

    if (model.provider === 'azure-openai') {
      return {
        providerId: 'azure-openai' as const,
        modelId: model.deployment,
        modelLabel: model.name,
        supportsImages: model.supportsImages,
        sdkModel: openaiCompatibleFactory({
          name: model.name,
          apiKey: model.apiKey,
          baseURL: model.baseUrl,
        })(model.deployment),
      };
    }

    if (model.provider === 'gemini') {
      return {
        providerId: 'gemini' as const,
        modelId: model.model,
        modelLabel: model.name,
        supportsImages: model.supportsImages,
        sdkModel: googleFactory(model.model),
      };
    }

    return {
      providerId: 'anthropic' as const,
      modelId: model.model,
      modelLabel: model.name,
      supportsImages: model.supportsImages,
      sdkModel: anthropicFactory(model.model),
    };
  },
});
```

```ts
// src/repositories/config-repository.ts
async getModelById(modelId: string) {
  const config = await readConfig();
  return config.models.find((item) => item.id === modelId && item.deletedAt === null) ?? null;
},
```

```json
// package.json
{
  "dependencies": {
    "ai": "^4.3.19",
    "@ai-sdk/openai-compatible": "^1.3.19",
    "@ai-sdk/google": "^1.2.22",
    "@ai-sdk/anthropic": "^1.2.11"
  }
}
```

- [ ] **Step 4: 重新跑 Provider registry 测试**

Run: `pnpm test:unit -- tests/unit/services/llm-dispatch/provider-registry.spec.ts -v`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add package.json pnpm-lock.yaml src/services/llm-dispatch/provider-registry.ts src/repositories/config-repository.ts tests/unit/services/llm-dispatch/provider-registry.spec.ts
git commit -m "feat: add provider registry"
```

### Task 3: 为主聊天流补仓储增量写入与 `StreamSession` 生命周期

**Files:**
- Create: `src/services/llm-dispatch/chat-dispatch-service.ts`
- Create: `tests/unit/services/llm-dispatch/session-lifecycle.spec.ts`
- Create: `tests/unit/repositories/conversation-editing.spec.ts`
- Modify: `src/repositories/conversation-repository.ts`

- [ ] **Step 1: 先写失败仓储测试，锁定“用户消息 -> 助手占位 -> chunk -> 完成/失败 -> loading 清理”**

```ts
// tests/unit/repositories/conversation-editing.spec.ts
import { describe, expect, it } from 'vitest';

import { createChromeLocalAdapter } from '../../../src/repositories/chrome-local-adapter';
import { createConversationRepository } from '../../../src/repositories/conversation-repository';
import { createFakeStorageArea } from '../../helpers/fake-storage';

describe('conversation editing', () => {
  it('按主链路增量写入消息并在完成后清理 loading', async () => {
    const repository = createConversationRepository(createChromeLocalAdapter(createFakeStorageArea()));
    const normalizedUrl = 'https://example.com/article';
    const promptTabId = 'chat';

    await repository.appendUserMessage({
      normalizedUrl,
      promptTabId,
      messageId: 'user-1',
      content: '总结一下这篇文章',
      images: [],
      now: 10,
    });
    await repository.appendAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId: 'assistant-1',
      modelId: 'model-1',
      now: 11,
    });
    await repository.saveLoadingState({
      id: 'loading:https://example.com/article:chat',
      normalizedUrl,
      promptTabId,
      sessionId: 'session-1',
      promptTabStatus: 'loading',
      branchStates: [],
      resumeTarget: {
        messageId: 'assistant-1',
      },
      cancelRequested: false,
      updatedAt: 11,
    });

    await repository.appendAssistantChunk({
      normalizedUrl,
      promptTabId,
      messageId: 'assistant-1',
      chunk: '这是首段。',
      now: 12,
    });
    await repository.finishAssistantMessage({
      normalizedUrl,
      promptTabId,
      messageId: 'assistant-1',
      now: 13,
    });
    await repository.removeLoadingState(normalizedUrl, promptTabId);

    const conversation = await repository.getConversation(normalizedUrl, promptTabId);
    expect(conversation?.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, status: item.status }))).toEqual([
      { id: 'user-1', role: 'user', content: '总结一下这篇文章', status: 'done' },
      { id: 'assistant-1', role: 'assistant', content: '这是首段。', status: 'done' },
    ]);
    await expect(repository.getLoadingState(normalizedUrl, promptTabId)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: 先写失败生命周期测试，锁定 dispatch 的完成、取消、错误回收**

```ts
// tests/unit/services/llm-dispatch/session-lifecycle.spec.ts
import { describe, expect, it, vi } from 'vitest';

import { createChatDispatchService } from '../../../../src/services/llm-dispatch/chat-dispatch-service';

describe('chat-dispatch-service', () => {
  it('流式输出时先写 loading，再写 chunk，完成后清理 loading', async () => {
    const streamText = vi.fn(async () => ({
      textStream: (async function* () {
        yield '你好';
        yield '，世界';
      })(),
    }));

    const conversationRepository = {
      appendUserMessage: vi.fn(),
      appendAssistantMessage: vi.fn(),
      appendAssistantChunk: vi.fn(),
      finishAssistantMessage: vi.fn(),
      failAssistantMessage: vi.fn(),
      saveLoadingState: vi.fn(),
      removeLoadingState: vi.fn(),
    };

    const portBus = {
      publishToPromptTab: vi.fn(),
    };

    const service = createChatDispatchService({
      streamText,
      providerRegistry: {
        resolveModel: vi.fn(() => ({
          providerId: 'openai-compatible',
          modelId: 'gpt-4o-mini',
          modelLabel: '主模型',
          supportsImages: true,
          sdkModel: {},
        })),
      },
      configRepository: {
        getModelById: vi.fn().mockResolvedValue({
          id: 'model-1',
          name: '主模型',
          provider: 'openai-compatible',
          enabled: true,
          model: 'gpt-4o-mini',
          baseUrl: 'https://api.example.com',
          apiKey: 'secret',
          deployment: '',
          temperature: 0.2,
          tools: [],
          thinkingBudget: null,
          maxOutputTokens: 512,
          supportsImages: true,
          order: 0,
          deletedAt: null,
        }),
      },
      conversationRepository,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      portBus,
      now: () => 100,
      createId: () => 'session-1',
    });

    await service.startChat({
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-1',
      text: '你好',
      images: [],
      includePageContent: true,
      pageContent: 'Example Domain',
    });

    expect(conversationRepository.saveLoadingState).toHaveBeenCalledTimes(1);
    expect(conversationRepository.appendAssistantChunk).toHaveBeenCalledTimes(2);
    expect(conversationRepository.finishAssistantMessage).toHaveBeenCalledTimes(1);
    expect(conversationRepository.removeLoadingState).toHaveBeenCalledTimes(1);
    expect(portBus.publishToPromptTab).toHaveBeenCalledWith(
      { normalizedUrl: 'https://example.com/article', promptTabId: 'chat' },
      expect.objectContaining({ type: 'STREAM_DONE', sessionId: 'session-1' }),
    );
  });
});
```

- [ ] **Step 3: 运行测试，确认当前仓储与调度层都缺能力**

Run: `pnpm test:unit -- tests/unit/repositories/conversation-editing.spec.ts tests/unit/services/llm-dispatch/session-lifecycle.spec.ts -v`

Expected: FAIL，提示缺少 `appendUserMessage`、`appendAssistantChunk`、`createChatDispatchService` 等实现。

- [ ] **Step 4: 写最小实现，先把主链路走通**

```ts
// src/repositories/conversation-repository.ts
async getLoadingState(normalizedUrl: string, promptTabId: string) {
  const result = await storage.get<Record<string, unknown>>([getLoadingKey(normalizedUrl, promptTabId)]);
  const value = result[getLoadingKey(normalizedUrl, promptTabId)];
  return value ? loadingStateRecordSchema.parse(value) : null;
},

async removeLoadingState(normalizedUrl: string, promptTabId: string) {
  await storage.remove([getLoadingKey(normalizedUrl, promptTabId)]);
},

async appendUserMessage({
  normalizedUrl,
  promptTabId,
  messageId,
  content,
  images,
  now,
}: {
  normalizedUrl: string;
  promptTabId: string;
  messageId: string;
  content: string;
  images: string[];
  now: number;
}) {
  const conversation =
    (await this.getConversation(normalizedUrl, promptTabId)) ??
    conversationRecordSchema.parse({
      id: `${normalizedUrl}:${promptTabId}`,
      normalizedUrl,
      promptTabId,
      messages: [],
      lastAssistantState: null,
      updatedAt: now,
    });

  return this.saveConversation({
    ...conversation,
    messages: [
      ...conversation.messages,
      {
        id: messageId,
        role: 'user',
        content,
        images,
        status: 'done',
        modelId: null,
        branches: [],
        retryFromMessageId: null,
        editedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  });
},
```

```ts
// src/services/llm-dispatch/chat-dispatch-service.ts
import { createLoadingState } from '../../domain/loading/loading-state-schema';

export const createChatDispatchService = ({
  streamText,
  providerRegistry,
  configRepository,
  conversationRepository,
  logger,
  portBus,
  now = () => Date.now(),
  createId = () => crypto.randomUUID(),
}: {
  streamText: typeof import('ai').streamText;
  providerRegistry: {
    resolveModel: (model: {
      id: string;
      supportsImages: boolean;
    }) => {
      providerId: string;
      modelId: string;
      modelLabel: string;
      supportsImages: boolean;
      sdkModel: unknown;
    };
  };
  configRepository: { getModelById: (modelId: string) => Promise<any> };
  conversationRepository: any;
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  portBus: { publishToPromptTab: (scope: { normalizedUrl: string; promptTabId: string }, event: Record<string, unknown>) => void };
  now?: () => number;
  createId?: () => string;
}) => ({
  async startChat(input: {
    browserTabId: number;
    normalizedUrl: string;
    promptTabId: string;
    modelId: string;
    text: string;
    images: string[];
    includePageContent: boolean;
    pageContent: string;
  }) {
    const sessionId = createId();
    const userMessageId = createId();
    const assistantMessageId = createId();
    const model = await configRepository.getModelById(input.modelId);
    if (!model) {
      throw new Error('model not found');
    }
    if (input.images.length > 0 && !model.supportsImages) {
      throw new Error('selected model does not support images');
    }

    const resolvedModel = providerRegistry.resolveModel(model);
    await conversationRepository.appendUserMessage({
      normalizedUrl: input.normalizedUrl,
      promptTabId: input.promptTabId,
      messageId: userMessageId,
      content: input.text,
      images: input.images,
      now: now(),
    });
    await conversationRepository.appendAssistantMessage({
      normalizedUrl: input.normalizedUrl,
      promptTabId: input.promptTabId,
      messageId: assistantMessageId,
      modelId: model.id,
      now: now(),
    });
    await conversationRepository.saveLoadingState(
      createLoadingState({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        sessionId,
        now: now(),
      }),
    );

    logger.info('chat.stream.started', {
      browserTabId: input.browserTabId,
      normalizedUrl: input.normalizedUrl,
      promptTab: input.promptTabId,
      sessionId,
      provider: resolvedModel.providerId,
    });

    const result = await streamText({
      model: resolvedModel.sdkModel as never,
      prompt: input.includePageContent && input.pageContent.trim()
        ? `页面内容：\n${input.pageContent}\n\n用户消息：${input.text}`
        : input.text,
    });

    let hasChunk = false;
    for await (const chunk of result.textStream) {
      hasChunk = true;
      await conversationRepository.appendAssistantChunk({
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
        messageId: assistantMessageId,
        chunk,
        now: now(),
      });
      portBus.publishToPromptTab(
        {
          normalizedUrl: input.normalizedUrl,
          promptTabId: input.promptTabId,
        },
        {
          type: 'STREAM_CHUNK',
          sessionId,
          messageId: assistantMessageId,
          chunk,
        },
      );
    }

    if (hasChunk) {
      logger.info('chat.stream.first_chunk', {
        normalizedUrl: input.normalizedUrl,
        promptTab: input.promptTabId,
        sessionId,
      });
    }

    await conversationRepository.finishAssistantMessage({
      normalizedUrl: input.normalizedUrl,
      promptTabId: input.promptTabId,
      messageId: assistantMessageId,
      now: now(),
    });
    await conversationRepository.removeLoadingState(input.normalizedUrl, input.promptTabId);
    portBus.publishToPromptTab(
      {
        normalizedUrl: input.normalizedUrl,
        promptTabId: input.promptTabId,
      },
      {
        type: 'STREAM_DONE',
        sessionId,
        messageId: assistantMessageId,
      },
    );

    return {
      sessionId,
      userMessageId,
      assistantMessageId,
    };
  },
});
```

- [ ] **Step 5: 跑通测试并提交**

Run: `pnpm test:unit -- tests/unit/repositories/conversation-editing.spec.ts tests/unit/services/llm-dispatch/session-lifecycle.spec.ts -v`

Expected: PASS

```bash
git add src/repositories/conversation-repository.ts src/services/llm-dispatch/chat-dispatch-service.ts tests/unit/repositories/conversation-editing.spec.ts tests/unit/services/llm-dispatch/session-lifecycle.spec.ts
git commit -m "feat: add chat session lifecycle"
```

### Task 4: 接入 typed command、port 恢复协议与 background 编排

**Files:**
- Modify: `src/services/runtime-messaging/sidebar-contract.ts`
- Modify: `src/services/runtime-messaging/sidebar-commands.ts`
- Modify: `src/services/runtime-messaging/port-bus.ts`
- Modify: `src/services/runtime-messaging/sidebar-api.ts`
- Modify: `entrypoints/background.ts`
- Modify: `tests/unit/services/runtime-messaging.spec.ts`
- Modify: `tests/unit/services/logger/logger.spec.ts`
- Modify: `src/services/logger/logger.ts`

- [ ] **Step 1: 先写失败测试，锁定 `SEND_CHAT / STOP_SESSION / EXPORT_CONVERSATION` 与 `RESTORE_LOADING` 事件**

```ts
// tests/unit/services/runtime-messaging.spec.ts
it('阶段 4 扩展 sidebar 命令与流式事件契约', () => {
  expect(sidebarCommandTypeValues).toEqual([
    'GET_SIDEBAR_BOOTSTRAP',
    'CONFIRM_BLACKLIST_CONTINUE',
    'SWITCH_EXTRACTION_METHOD',
    'RE_EXTRACT_CONTENT',
    'SEND_CHAT',
    'STOP_SESSION',
    'EXPORT_CONVERSATION',
  ]);

  expect(
    sidebarCommandSchema.parse({
      type: 'SEND_CHAT',
      tabId: 7,
      pageUrl: 'https://example.com/article',
      promptTabId: 'chat',
      modelId: 'model-1',
      text: '你好',
      images: [],
      includePageContent: true,
    }),
  ).toEqual(
    expect.objectContaining({
      type: 'SEND_CHAT',
      promptTabId: 'chat',
      modelId: 'model-1',
    }),
  );

  expect(
    sidebarPortEventSchema.parse({
      type: 'RESTORE_LOADING',
      normalizedUrl: 'https://example.com/article',
      promptTabId: 'chat',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      content: '部分回答',
    }),
  ).toEqual(
    expect.objectContaining({
      type: 'RESTORE_LOADING',
      sessionId: 'session-1',
    }),
  );
});
```

```ts
// tests/unit/services/logger/logger.spec.ts
it('阶段 4 日志事件名稳定且继续脱敏', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const logger = createLogger('background');

  try {
    logger.info('chat.stream.started', {
      sessionId: 'session-1',
      promptTab: 'chat',
      apiKey: 'secret',
    });
    logger.error('chat.stream.failed', {
      sessionId: 'session-1',
      authorization: 'Bearer secret',
    });

    expect(infoSpy).toHaveBeenCalledWith('[background] chat.stream.started', {
      sessionId: 'session-1',
      promptTab: 'chat',
      apiKey: '[REDACTED]',
    });
    expect(errorSpy).toHaveBeenCalledWith('[background] chat.stream.failed', {
      sessionId: 'session-1',
      authorization: '[REDACTED]',
    });
  } finally {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  }
});
```

- [ ] **Step 2: 运行测试，确认契约尚未扩展**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts tests/unit/services/logger/logger.spec.ts -v`

Expected: FAIL，提示缺少阶段 4 命令和 `RESTORE_LOADING` 事件。

- [ ] **Step 3: 写最小实现，真正把 background、port、命令处理串起来**

```ts
// src/services/runtime-messaging/sidebar-contract.ts
export const sidebarCommandTypeValues = [
  'GET_SIDEBAR_BOOTSTRAP',
  'CONFIRM_BLACKLIST_CONTINUE',
  'SWITCH_EXTRACTION_METHOD',
  'RE_EXTRACT_CONTENT',
  'SEND_CHAT',
  'STOP_SESSION',
  'EXPORT_CONVERSATION',
] as const;

export const sidebarSendChatCommandSchema = sidebarCommandBaseSchema.extend({
  type: z.literal('SEND_CHAT'),
  promptTabId: z.string().min(1),
  modelId: z.string().min(1),
  text: z.string(),
  images: z.array(z.string()),
  includePageContent: z.boolean(),
});

export const sidebarStopSessionCommandSchema = sidebarCommandBaseSchema.extend({
  type: z.literal('STOP_SESSION'),
  promptTabId: z.string().min(1),
  sessionId: z.string().min(1),
});

export const sidebarExportConversationCommandSchema = sidebarCommandBaseSchema.extend({
  type: z.literal('EXPORT_CONVERSATION'),
  promptTabId: z.string().min(1),
});

export const sidebarCommandSchema = z.discriminatedUnion('type', [
  sidebarBootstrapCommandSchema,
  sidebarConfirmBlacklistContinueCommandSchema,
  sidebarSwitchExtractionMethodCommandSchema,
  sidebarReExtractContentCommandSchema,
  sidebarSendChatCommandSchema,
  sidebarStopSessionCommandSchema,
  sidebarExportConversationCommandSchema,
]);

export const sidebarPortClientMessageSchema = z.object({
  type: z.literal('SUBSCRIBE_SIDEBAR_STREAM'),
  tabId: z.number().int().positive(),
  pageUrl: z.string().url(),
  promptTabId: z.string().min(1),
});

export const sidebarPortEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STREAM_CHUNK'),
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
    chunk: z.string(),
  }),
  z.object({
    type: z.literal('STREAM_DONE'),
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
  }),
  z.object({
    type: z.literal('STREAM_ERROR'),
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
    errorMessage: z.string().min(1),
  }),
  z.object({
    type: z.literal('STREAM_CANCELLED'),
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
  }),
  z.object({
    type: z.literal('LOADING_STATE_UPDATE'),
    normalizedUrl: z.string().min(1),
    promptTabId: z.string().min(1),
    sessionId: z.string().min(1),
    status: z.enum(['loading', 'cancelled', 'error']),
  }),
  z.object({
    type: z.literal('RESTORE_LOADING'),
    normalizedUrl: z.string().min(1),
    promptTabId: z.string().min(1),
    sessionId: z.string().min(1),
    messageId: z.string().min(1),
    content: z.string(),
  }),
]);
```

```ts
// src/services/runtime-messaging/port-bus.ts
type PromptTabScope = {
  normalizedUrl: string;
  promptTabId: string;
};

type SidebarPortRecord = {
  port: chrome.runtime.Port;
  scope: PromptTabScope | null;
};

export const createPortBus = () => {
  const ports = new Map<string, SidebarPortRecord>();

  const getPortId = (port: chrome.runtime.Port) =>
    `${port.sender?.documentId ?? 'unknown'}:${port.name}:${Date.now()}:${Math.random()}`;

  return {
    register(port: chrome.runtime.Port) {
      const portId = getPortId(port);
      ports.set(portId, { port, scope: null });
      return portId;
    },
    bindPromptTab(portId: string, scope: PromptTabScope) {
      const record = ports.get(portId);
      if (!record) {
        return;
      }
      record.scope = scope;
    },
    unregister(portId: string) {
      ports.delete(portId);
    },
    publishToPromptTab(scope: PromptTabScope, event: Record<string, unknown>) {
      for (const record of ports.values()) {
        if (record.scope?.normalizedUrl !== scope.normalizedUrl || record.scope?.promptTabId !== scope.promptTabId) {
          continue;
        }
        record.port.postMessage(event);
      }
    },
  };
};
```

```ts
// entrypoints/background.ts
const providerRegistry = createProviderRegistry();
const portBus = createPortBus();
const chatDispatchService = createChatDispatchService({
  streamText,
  providerRegistry,
  configRepository,
  conversationRepository,
  logger,
  portBus,
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') {
    return;
  }

  const portId = portBus.register(port);
  logger.info('port.connected', {
    portName: port.name,
  });

  port.onMessage.addListener(async (message: unknown) => {
    const parsed = sidebarPortClientMessageSchema.parse(message);
    if (parsed.type === 'SUBSCRIBE_SIDEBAR_STREAM') {
      const normalizedUrl = normalizePageUrl(parsed.pageUrl);
      portBus.bindPromptTab(portId, {
        normalizedUrl,
        promptTabId: parsed.promptTabId,
      });
      logger.info('port.restore_requested', {
        normalizedUrl,
        promptTab: parsed.promptTabId,
      });

      const loading = await conversationRepository.getLoadingState(normalizedUrl, parsed.promptTabId);
      const conversation = await conversationRepository.getConversation(normalizedUrl, parsed.promptTabId);
      const targetMessage = loading?.resumeTarget?.messageId
        ? conversation?.messages.find((item) => item.id === loading.resumeTarget?.messageId)
        : null;

      if (loading && targetMessage) {
        port.postMessage({
          type: 'RESTORE_LOADING',
          normalizedUrl,
          promptTabId: parsed.promptTabId,
          sessionId: loading.sessionId,
          messageId: targetMessage.id,
          content: targetMessage.content,
        });
      }
    }
  });

  port.onDisconnect.addListener(() => {
    portBus.unregister(portId);
    logger.info('port.disconnected', {
      portName: port.name,
    });
  });
});
```

- [ ] **Step 4: 跑单测，确认命令契约、port 恢复与日志事件都转绿**

Run: `pnpm test:unit -- tests/unit/services/runtime-messaging.spec.ts tests/unit/services/logger/logger.spec.ts -v`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/services/runtime-messaging/sidebar-contract.ts src/services/runtime-messaging/sidebar-commands.ts src/services/runtime-messaging/port-bus.ts src/features/sidebar/sidebar-api.ts entrypoints/background.ts src/services/logger/logger.ts tests/unit/services/runtime-messaging.spec.ts tests/unit/services/logger/logger.spec.ts
git commit -m "feat: wire sidebar streaming commands"
```

### Task 5: 把侧边栏聊天区、输入区与导出守卫接上真实数据

**Files:**
- Create: `src/features/sidebar/chat-input.tsx`
- Create: `src/features/sidebar/chat-thread.tsx`
- Modify: `src/features/sidebar/sidebar-shell.tsx`
- Modify: `src/features/sidebar/sidebar-api.ts`
- Modify: `entrypoints/sidebar/main.tsx`
- Create: `tests/component/sidebar/chat-input.spec.tsx`
- Create: `tests/component/sidebar/loading-restore.spec.tsx`
- Create: `tests/component/sidebar/export-guard.spec.tsx`

- [ ] **Step 1: 先写失败组件测试，锁定输入、恢复和空导出守卫**

```tsx
// tests/component/sidebar/chat-input.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '../../../src/features/sidebar/chat-input';

describe('ChatInput', () => {
  it('没有文本也没有图片时禁止发送', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <ChatInput
        disabled={false}
        sending={false}
        selectedModelId="model-1"
        supportsImages={true}
        onSend={onSend}
        onStop={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('请输入文本或添加图片')).toBeVisible();
  });
});
```

```tsx
// tests/component/sidebar/loading-restore.spec.tsx
it('重开 side panel 后展示恢复中的助手消息', async () => {
  const api = {
    getSidebarBootstrap: vi.fn().mockResolvedValue({
      type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      page: null,
      conversations: [
        {
          id: 'https://example.com/article:chat',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'chat',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '部分回答',
              images: [],
              status: 'loading',
              modelId: 'model-1',
              branches: [],
              retryFromMessageId: null,
              editedAt: null,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          lastAssistantState: null,
          updatedAt: 2,
        },
      ],
      loadingStates: [
        {
          id: 'loading:https://example.com/article:chat',
          normalizedUrl: 'https://example.com/article',
          promptTabId: 'chat',
          sessionId: 'session-1',
          promptTabStatus: 'loading',
          branchStates: [],
          resumeTarget: { messageId: 'assistant-1' },
          cancelRequested: false,
          updatedAt: 2,
        },
      ],
      blockedByBlacklist: false,
      matchedRuleId: null,
      shouldExtract: false,
    }),
    confirmBlacklistContinue: vi.fn(),
    reExtractContent: vi.fn(),
    switchExtractionMethod: vi.fn(),
    sendChat: vi.fn(),
    stopSession: vi.fn(),
    exportConversation: vi.fn(),
    connectStream: vi.fn(() => ({
      disconnect: vi.fn(),
    })),
  };

  render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

  expect(await screen.findByText('部分回答')).toBeVisible();
  expect(screen.getByText('恢复生成中…')).toBeVisible();
});
```

```tsx
// tests/component/sidebar/export-guard.spec.tsx
it('空会话导出时不给下载文件', async () => {
  const user = userEvent.setup();
  const api = {
    getSidebarBootstrap: vi.fn().mockResolvedValue({
      type: 'GET_SIDEBAR_BOOTSTRAP_SUCCESS',
      browserTabId: 7,
      normalizedUrl: 'https://example.com/article',
      page: null,
      conversations: [],
      loadingStates: [],
      blockedByBlacklist: false,
      matchedRuleId: null,
      shouldExtract: false,
    }),
    confirmBlacklistContinue: vi.fn(),
    reExtractContent: vi.fn(),
    switchExtractionMethod: vi.fn(),
    sendChat: vi.fn(),
    stopSession: vi.fn(),
    exportConversation: vi.fn(),
    connectStream: vi.fn(() => ({
      disconnect: vi.fn(),
    })),
  };

  render(<SidebarShell api={api} tabId={7} pageUrl="https://example.com/article" />);

  await user.click(await screen.findByRole('button', { name: '导出' }));

  expect(api.exportConversation).not.toHaveBeenCalled();
  expect(screen.getByText('当前会话为空，不能导出')).toBeVisible();
});
```

- [ ] **Step 2: 运行测试，确认当前侧边栏没有真实聊天 UI**

Run: `pnpm test:component -- tests/component/sidebar/chat-input.spec.tsx tests/component/sidebar/loading-restore.spec.tsx tests/component/sidebar/export-guard.spec.tsx -v`

Expected: FAIL，提示缺少 `ChatInput`、`ChatThread`、`sendChat`/`exportConversation` 能力和恢复态 UI。

- [ ] **Step 3: 写最小实现，先把真实 `Chat` 主链路接起来**

```tsx
// src/features/sidebar/chat-input.tsx
import { useState } from 'react';

type ChatInputProps = {
  disabled: boolean;
  sending: boolean;
  selectedModelId: string;
  supportsImages: boolean;
  onSend: (input: { text: string; images: string[]; modelId: string; includePageContent: boolean }) => Promise<void>;
  onStop: () => Promise<void>;
  onExport: () => Promise<void>;
};

export const ChatInput = ({ disabled, sending, selectedModelId, supportsImages, onSend, onStop, onExport }: ChatInputProps) => {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [includePageContent, setIncludePageContent] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  return (
    <section className="border-t border-border px-4 py-3">
      <textarea
        aria-label="聊天输入"
        className="min-h-24 w-full rounded-md border border-border bg-background p-3"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            aria-label="包含页面内容"
            type="checkbox"
            checked={includePageContent}
            onChange={(event) => setIncludePageContent(event.target.checked)}
          />
          <span>包含页面内容</span>
        </label>
        <label className="text-sm">
          <span className="sr-only">添加图片</span>
          <input
            aria-label="添加图片"
            type="file"
            accept="image/*"
            disabled={disabled || !supportsImages}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              const dataUrl = await fileToDataUrl(file);
              setImages((value) => [...value, dataUrl]);
            }}
          />
        </label>
        <button
          type="button"
          disabled={disabled || sending}
          onClick={() => {
            if (text.trim().length === 0 && images.length === 0) {
              setErrorMessage('请输入文本或添加图片');
              return;
            }
            setErrorMessage('');
            void onSend({
              text,
              images,
              modelId: selectedModelId,
              includePageContent,
            }).then(() => {
              setText('');
              setImages([]);
            });
          }}
        >
          发送
        </button>
        <button type="button" disabled={!sending} onClick={() => void onStop()}>
          停止
        </button>
        <button type="button" onClick={() => void onExport()}>
          导出
        </button>
      </div>
      {errorMessage ? <p className="mt-2 text-sm text-destructive">{errorMessage}</p> : null}
      {!supportsImages ? <p className="mt-2 text-xs text-muted-foreground">当前模型不支持图片输入</p> : null}
    </section>
  );
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
```

```tsx
// src/features/sidebar/chat-thread.tsx
type ChatThreadProps = {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    status: 'loading' | 'done' | 'error' | 'cancelled';
  }>;
  restoreMessageId: string | null;
};

export const ChatThread = ({ messages, restoreMessageId }: ChatThreadProps) => (
  <section className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
    {messages.map((message) => (
      <article key={message.id} className="rounded-lg border border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">{message.role === 'user' ? '你' : '助手'}</p>
        <div className="whitespace-pre-wrap">{message.content || '...'}</div>
        {restoreMessageId === message.id ? <p className="mt-2 text-xs text-muted-foreground">恢复生成中…</p> : null}
      </article>
    ))}
  </section>
);
```

```tsx
// src/features/sidebar/sidebar-shell.tsx
const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; status: 'loading' | 'done' | 'error' | 'cancelled' }>>([]);
const [restoreMessageId, setRestoreMessageId] = useState<string | null>(null);
const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
const [selectedModelId, setSelectedModelId] = useState<string>('');
const [supportsImages, setSupportsImages] = useState(false);

useEffect(() => {
  const connection = api.connectStream({
    tabId,
    pageUrl,
    promptTabId: 'chat',
    onEvent(event) {
      if (event.type === 'STREAM_CHUNK') {
        setMessages((current) =>
          current.map((item) =>
            item.id === event.messageId
              ? {
                  ...item,
                  content: `${item.content}${event.chunk}`,
                  status: 'loading',
                }
              : item,
          ),
        );
      }

      if (event.type === 'STREAM_DONE') {
        setActiveSessionId(null);
        setRestoreMessageId(null);
        setMessages((current) => current.map((item) => (item.id === event.messageId ? { ...item, status: 'done' } : item)));
      }

      if (event.type === 'RESTORE_LOADING') {
        setActiveSessionId(event.sessionId);
        setRestoreMessageId(event.messageId);
      }
    },
  });

  return () => {
    connection.disconnect();
  };
}, [api, pageUrl, tabId]);
```

- [ ] **Step 4: 跑组件测试，确认聊天输入、恢复展示和空导出守卫通过**

Run: `pnpm test:component -- tests/component/sidebar/chat-input.spec.tsx tests/component/sidebar/loading-restore.spec.tsx tests/component/sidebar/export-guard.spec.tsx -v`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/features/sidebar/chat-input.tsx src/features/sidebar/chat-thread.tsx src/features/sidebar/sidebar-shell.tsx src/features/sidebar/sidebar-api.ts entrypoints/sidebar/main.tsx tests/component/sidebar/chat-input.spec.tsx tests/component/sidebar/loading-restore.spec.tsx tests/component/sidebar/export-guard.spec.tsx
git commit -m "feat: connect sidebar chat ui"
```

### Task 6: 补 E2E、回写文档并完成阶段 4 验收口径

**Files:**
- Create: `tests/e2e/sidebar-chat.spec.ts`
- Create: `tests/e2e/service-worker-recovery.spec.ts`
- Modify: `docs/Services/llm-dispatch.md`
- Modify: `docs/Services/runtime-messaging.md`
- Modify: `docs/Services/logger.md`
- Modify: `docs/DataSchema/conversation.md`
- Modify: `docs/DataSchema/loading-state.md`
- Modify: `docs/dao/conversation-repository.md`
- Modify: `docs/Workspace/sidebar.md`
- Modify: `docs/Workspace/settings.md`
- Modify: `docs/flow.md`
- Modify: `docs/test/llm-and-streaming.md`
- Modify: `docs/test/sidebar-core.md`

- [ ] **Step 1: 先写失败 E2E，固定“发送 -> 首包 -> 完成 -> 重开恢复”和“worker 重启后恢复”**

```ts
// tests/e2e/sidebar-chat.spec.ts
import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('side panel 可以发送消息、收到首包流式并在完成后写入历史', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(() => {
    (globalThis as typeof globalThis & {
      __THINK_BOT_TEST_STREAM__?: Array<string>;
    }).__THINK_BOT_TEST_STREAM__ = ['你好', '，这是测试响应'];
  });

  const page = await context.newPage();
  await page.goto('https://example.com/');
  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=1&pageUrl=${encodeURIComponent('https://example.com/')}`,
  );

  await sidepanel.getByLabel('聊天输入').fill('请总结当前页面');
  await sidepanel.getByRole('button', { name: '发送' }).click();

  await expect(sidepanel.getByText('你好')).toBeVisible();
  await expect(sidepanel.getByText('你好，这是测试响应')).toBeVisible();

  await sidepanel.close();

  const reopened = await context.newPage();
  await reopened.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=1&pageUrl=${encodeURIComponent('https://example.com/')}`,
  );
  await expect(reopened.getByText('你好，这是测试响应')).toBeVisible();
});
```

```ts
// tests/e2e/service-worker-recovery.spec.ts
import { EXTENSION_PAGES } from '../../src/shared/extension-pages';
import { expect, test } from './helpers/extension-fixture';

test('worker 重启后仍能恢复持久化 loading', async ({ context, extensionId }) => {
  const serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    throw new Error('未找到扩展 service worker');
  }

  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      'conversation:https://example.com/article:chat': {
        id: 'https://example.com/article:chat',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '恢复中的回答',
            images: [],
            status: 'loading',
            modelId: 'model-1',
            branches: [],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        lastAssistantState: null,
        updatedAt: 2,
      },
      'loading:https://example.com/article:chat': {
        id: 'loading:https://example.com/article:chat',
        normalizedUrl: 'https://example.com/article',
        promptTabId: 'chat',
        sessionId: 'session-restore',
        promptTabStatus: 'loading',
        branchStates: [],
        resumeTarget: { messageId: 'assistant-1' },
        cancelRequested: false,
        updatedAt: 2,
      },
    });
  });

  const sidepanel = await context.newPage();
  await sidepanel.goto(
    `chrome-extension://${extensionId}/${EXTENSION_PAGES.sidePanel}?tabId=7&pageUrl=${encodeURIComponent('https://example.com/article')}`,
  );

  await expect(sidepanel.getByText('恢复中的回答')).toBeVisible();
  await expect(sidepanel.getByText('恢复生成中…')).toBeVisible();
});
```

- [ ] **Step 2: 运行 E2E，确认当前端到端链路仍然缺失**

Run: `pnpm test:e2e -- tests/e2e/sidebar-chat.spec.ts`

Expected: FAIL，无法发送或无法看到流式内容。

Run: `pnpm test:e2e -- tests/e2e/service-worker-recovery.spec.ts`

Expected: FAIL，无法恢复 loading UI。

- [ ] **Step 3: 实现 E2E 所需最小测试桩，并同步文档**

```ts
// entrypoints/background.ts
const testStream = (globalThis as typeof globalThis & {
  __THINK_BOT_TEST_STREAM__?: Array<string>;
}).__THINK_BOT_TEST_STREAM__;

const streamTextImpl: typeof import('ai').streamText = testStream
  ? (async () => ({
      textStream: (async function* () {
        for (const chunk of testStream) {
          yield chunk;
        }
      })(),
    })) as typeof import('ai').streamText
  : streamText;
```

```md
<!-- docs/flow.md -->
## 7. 主流程：发送消息与流式输出（阶段 4 落地版）

1. side panel 通过 `SEND_CHAT` 提交 `promptTabId / modelId / text / images / includePageContent`。
2. background 读取模型配置、页面内容与会话状态。
3. 调度层先写用户消息、助手占位和 `LoadingStateRecord`。
4. provider 流式返回后，每个 chunk 先落 `ConversationRecord`，再通过 port 推 `STREAM_CHUNK`。
5. side panel 关闭或 port 断开后，已落盘内容仍可见。
6. side panel 重开或 worker 重启后，通过 `SUBSCRIBE_SIDEBAR_STREAM` 触发 `RESTORE_LOADING`，恢复最近一条未完成助手消息。
7. 完成、取消、错误后回收 loading，并输出稳定日志事件。
```

```md
<!-- docs/Workspace/settings.md -->
- 模型配置新增显式 `supportsImages` 开关。
- 阶段 4 的图片发送前校验只依赖该字段，不依赖模型名猜测。
```

- [ ] **Step 4: 跑阶段 4 验收命令**

Run: `pnpm test:unit -- tests/unit/services/llm-dispatch`

Expected: PASS

Run: `pnpm test:component -- tests/component/sidebar/chat-input.spec.tsx`

Expected: PASS

Run: `pnpm test:e2e -- tests/e2e/sidebar-chat.spec.ts`

Expected: PASS

Run: `pnpm test:e2e -- tests/e2e/service-worker-recovery.spec.ts`

Expected: PASS

Run: `pnpm build`

Expected: PASS

- [ ] **Step 5: 提交阶段 4 收口**

```bash
git add tests/e2e/sidebar-chat.spec.ts tests/e2e/service-worker-recovery.spec.ts docs/Services/llm-dispatch.md docs/Services/runtime-messaging.md docs/Services/logger.md docs/DataSchema/conversation.md docs/DataSchema/loading-state.md docs/dao/conversation-repository.md docs/Workspace/sidebar.md docs/Workspace/settings.md docs/flow.md docs/test/llm-and-streaming.md docs/test/sidebar-core.md
git commit -m "feat: deliver stage 4 streaming chat flow"
```

## 自检结论

- 覆盖到的阶段 4 需求：
  - 文本/图片发送。
  - Provider registry。
  - `StreamSession` 生命周期。
  - `SEND_CHAT / STOP_SESSION / EXPORT_CONVERSATION`。
  - chunk 增量写入、loading 恢复、side panel 重开恢复。
  - `port.connected / port.disconnected / port.restore_requested` 与 `chat.stream.*` 日志。
  - 空会话导出明确失败。
- 仍明确留在阶段 5 的能力：
  - 分支并发、继续新增分支。
  - 消息编辑、重试、局部停止/删除。
  - 快捷输入自动触发与 `promptTab` 多标签完整工作台。
- 计划中的关键命名保持一致：
  - 显式能力字段统一叫 `supportsImages`。
  - 主发送命令统一叫 `SEND_CHAT`。
  - 恢复事件统一叫 `RESTORE_LOADING`。
  - 主聊天默认 `promptTabId` 固定为 `chat`。
