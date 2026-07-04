import { describe, expect, it } from 'vitest';

import {
  buildConversationKey,
  conversationRecordSchema,
} from '../../../src/domain/conversation/conversation-schema';
import {
  buildConversationStorageKey,
  buildLoadingStorageKey,
} from '../../../src/shared/storage-keys';

describe('conversation schema', () => {
  it('隔离 chat 和快捷输入会话 key', () => {
    expect(buildConversationKey('https://example.com', 'chat')).toBe(
      'https://example.com:chat',
    );
    expect(buildConversationKey('https://example.com', 'quick-1')).toBe(
      'https://example.com:quick-1',
    );
    expect(buildConversationKey('https://example.com', 'chat')).not.toBe(
      buildConversationKey('https://example.com', 'quick-1'),
    );
  });

  it('拒绝包含冒号的 promptTabId 生成主键', () => {
    expect(() => buildConversationKey('https://example.com', 'chat:1')).toThrow();
    expect(() => buildConversationStorageKey('https://example.com', 'chat:1')).toThrow();
    expect(() => buildLoadingStorageKey('https://example.com', 'chat:1')).toThrow();
  });

  it('只允许 assistant 消息挂载分支', () => {
    expect(
      conversationRecordSchema.safeParse({
        id: 'https://example.com:chat',
        normalizedUrl: 'https://example.com',
        promptTabId: 'chat',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            content: 'hello',
            images: [],
            status: 'done',
            modelId: 'model-a',
            branches: [
              {
                id: 'b1',
                modelId: 'model-b',
                modelLabel: 'Model B',
                content: 'branch',
                status: 'done',
                errorMessage: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'm2',
            role: 'user',
            content: 'hi',
            images: [],
            status: 'done',
            modelId: null,
            branches: [
              {
                id: 'b2',
                modelId: 'model-b',
                modelLabel: 'Model B',
                content: 'branch',
                status: 'done',
                errorMessage: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        lastAssistantState: null,
        updatedAt: 1,
      }).success,
    ).toBe(false);
  });

  it('旧分支记录缺少耗时时默认回填 null', () => {
    const parsed = conversationRecordSchema.parse({
      id: 'https://example.com:chat',
      normalizedUrl: 'https://example.com',
      promptTabId: 'chat',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'hello',
          images: [],
          status: 'done',
          errorMessage: null,
          modelId: 'model-a',
          branches: [
            {
              id: 'b1',
              modelId: 'model-b',
              modelLabel: 'Model B',
              isPrimary: true,
              content: 'branch',
              status: 'done',
              errorMessage: null,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          selectedBranchId: 'b1',
          retryFromMessageId: null,
          editedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      lastAssistantState: null,
      updatedAt: 1,
    });

    expect(parsed.messages[0]?.branches[0]?.durationMs).toBeNull();
  });

  it('拒绝重复 message.id 和 branch.id', () => {
    expect(
      conversationRecordSchema.safeParse({
        id: 'https://example.com:chat',
        normalizedUrl: 'https://example.com',
        promptTabId: 'chat',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            content: 'hello',
            images: [],
            status: 'done',
            modelId: 'model-a',
            branches: [],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'm1',
            role: 'user',
            content: 'hi',
            images: [],
            status: 'done',
            modelId: null,
            branches: [],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        lastAssistantState: null,
        updatedAt: 1,
      }).success,
    ).toBe(false);

    expect(
      conversationRecordSchema.safeParse({
        id: 'https://example.com:chat',
        normalizedUrl: 'https://example.com',
        promptTabId: 'chat',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            content: 'hello',
            images: [],
            status: 'done',
            modelId: 'model-a',
            branches: [
              {
                id: 'b1',
                modelId: 'model-b',
                modelLabel: 'Model B',
                content: 'branch',
                status: 'done',
                errorMessage: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'm2',
            role: 'assistant',
            content: 'world',
            images: [],
            status: 'done',
            modelId: 'model-a',
            branches: [
              {
                id: 'b1',
                modelId: 'model-c',
                modelLabel: 'Model C',
                content: 'branch',
                status: 'done',
                errorMessage: null,
                createdAt: 2,
                updatedAt: 2,
              },
            ],
            retryFromMessageId: null,
            editedAt: null,
            createdAt: 2,
            updatedAt: 2,
          },
        ],
        lastAssistantState: null,
        updatedAt: 2,
      }).success,
    ).toBe(false);
  });
});
