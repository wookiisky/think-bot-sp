import { describe, expect, it } from 'vitest';

import type { ModelConfig, ReasoningEffort } from '../../../../src/domain/config/config-schema';
import { parseClaudeModel, resolveModelRequestOptions } from '../../../../src/services/llm-dispatch/model-request-options';

const resolve = (provider: ModelConfig['provider'], modelId: string, reasoningEffort: ReasoningEffort = 'medium') =>
  resolveModelRequestOptions({ provider, modelId, reasoningEffort });

describe('parseClaudeModel', () => {
  it.each([
    ['claude-opus-4-5-20251101', 'opus', 4.5],
    ['claude-opus-4-20250514', 'opus', 4],
    ['claude-opus-4-1-20250805', 'opus', 4.1],
    ['claude-sonnet-4-6', 'sonnet', 4.6],
    ['claude-sonnet-5', 'sonnet', 5],
    ['claude-fable-5-1', 'fable', 5.1],
    ['claude-3-7-sonnet-latest', 'sonnet', 3.7],
    ['claude-3-5-haiku-20241022', 'haiku', 3.5],
    ['claude-3-haiku-20240307', 'haiku', 3],
    ['us.anthropic.claude-opus-4-5-20251101-v1:0', 'opus', 4.5],
    ['claude-opus-4-5@20251101', 'opus', 4.5],
    ['anthropic/claude-opus-4.6', 'opus', 4.6],
    ['anthropic/claude-fable-5.1', 'fable', 5.1],
    ['anthropic/claude-3.7-sonnet', 'sonnet', 3.7],
  ])('%s -> %s %s', (modelId, family, version) => {
    expect(parseClaudeModel(modelId)).toEqual({ family, version });
  });

  it('非 Claude 模型返回 null，无法识别的 Claude 变体返回 unknown', () => {
    expect(parseClaudeModel('gpt-5.4')).toBeNull();
    expect(parseClaudeModel('claude-next-preview')).toEqual({ family: 'unknown', version: null });
  });
});

describe('resolveModelRequestOptions / openai-compatible', () => {
  it('reasoning 模型透传 reasoningEffort，键名为 provider 名称', () => {
    expect(resolve('openai-compatible', 'gpt-5-mini', 'low')).toEqual({
      maxOutputTokens: null,
      providerOptions: { 'openai-compatible': { reasoningEffort: 'low' } },
    });
    expect(resolve('openai-compatible', 'o3', 'high').providerOptions).toEqual({
      'openai-compatible': { reasoningEffort: 'high' },
    });
    expect(resolve('azure-openai', 'gpt-5-deployment', 'medium').providerOptions).toEqual({
      'azure-openai': { reasoningEffort: 'medium' },
    });
  });

  it('非 reasoning 模型不发送 reasoning_effort，避免 400', () => {
    expect(resolve('openai-compatible', 'gpt-4.1-mini', 'high')).toEqual({ maxOutputTokens: null });
    expect(resolve('openai-compatible', 'gpt-4o', 'max')).toEqual({ maxOutputTokens: null });
    expect(resolve('azure-openai', 'my-deployment', 'max')).toEqual({ maxOutputTokens: null });
  });

  it('max 仅在支持 xhigh 的模型上升级，否则退到 high', () => {
    expect(resolve('openai-compatible', 'gpt-5.4', 'max').providerOptions).toEqual({
      'openai-compatible': { reasoningEffort: 'xhigh' },
    });
    expect(resolve('openai-compatible', 'gpt-5.1-codex-max', 'max').providerOptions).toEqual({
      'openai-compatible': { reasoningEffort: 'xhigh' },
    });
    expect(resolve('openai-compatible', 'gpt-5.1', 'max').providerOptions).toEqual({
      'openai-compatible': { reasoningEffort: 'high' },
    });
    expect(resolve('openai-compatible', 'o3-mini', 'max').providerOptions).toEqual({
      'openai-compatible': { reasoningEffort: 'high' },
    });
  });
});

describe('resolveModelRequestOptions / openrouter', () => {
  it('Claude 4.6+ / Fable 发统一 reasoning 对象并附带 verbosity，max 原样透传', () => {
    expect(resolve('openrouter', 'anthropic/claude-opus-5', 'max')).toEqual({
      maxOutputTokens: null,
      providerOptions: { openrouter: { reasoning: { enabled: true, effort: 'max' }, textVerbosity: 'max' } },
    });
    expect(resolve('openrouter', 'anthropic/claude-fable-5.1', 'low').providerOptions).toEqual({
      openrouter: { reasoning: { enabled: true, effort: 'low' }, textVerbosity: 'low' },
    });
  });

  it('Claude 3.7 到 4.5 只开启 reasoning，不发 verbosity；3.5 及更早不发', () => {
    expect(resolve('openrouter', 'anthropic/claude-sonnet-4.5', 'high').providerOptions).toEqual({
      openrouter: { reasoning: { enabled: true, effort: 'high' } },
    });
    expect(resolve('openrouter', 'anthropic/claude-3.7-sonnet', 'medium').providerOptions).toEqual({
      openrouter: { reasoning: { enabled: true, effort: 'medium' } },
    });
    expect(resolve('openrouter', 'anthropic/claude-3.5-sonnet', 'high')).toEqual({ maxOutputTokens: null });
  });

  it('OpenAI reasoning 模型只发 reasoning.effort，非 reasoning 模型不发', () => {
    expect(resolve('openrouter', 'openai/gpt-6-astra', 'max').providerOptions).toEqual({
      openrouter: { reasoning: { effort: 'max' } },
    });
    expect(resolve('openrouter', 'openai/gpt-5.4', 'low').providerOptions).toEqual({
      openrouter: { reasoning: { effort: 'low' } },
    });
    expect(resolve('openrouter', 'openai/o3', 'high').providerOptions).toEqual({
      openrouter: { reasoning: { effort: 'high' } },
    });
    expect(resolve('openrouter', 'openai/gpt-4.1', 'high')).toEqual({ maxOutputTokens: null });
  });

  it('Gemini 2.5 / 3 开启 reasoning，其他家族不发', () => {
    expect(resolve('openrouter', 'google/gemini-3-pro', 'high').providerOptions).toEqual({
      openrouter: { reasoning: { enabled: true, effort: 'high' } },
    });
    expect(resolve('openrouter', 'google/gemini-2.0-flash', 'high')).toEqual({ maxOutputTokens: null });
    expect(resolve('openrouter', 'meta-llama/llama-4-maverick', 'high')).toEqual({ maxOutputTokens: null });
  });
});

describe('resolveModelRequestOptions / anthropic', () => {
  it('4.6 及之后版本透传 effort 且输出上限为 128K', () => {
    expect(resolve('anthropic', 'claude-opus-4-6', 'max')).toEqual({
      maxOutputTokens: 128_000,
      providerOptions: { anthropic: { effort: 'max' } },
    });
    expect(resolve('anthropic', 'claude-sonnet-5', 'low')).toEqual({
      maxOutputTokens: 128_000,
      providerOptions: { anthropic: { effort: 'low' } },
    });
    expect(resolve('anthropic', 'claude-fable-5-1', 'medium').providerOptions).toEqual({
      anthropic: { effort: 'medium' },
    });
  });

  it('Opus 4.5 支持 effort 但没有 max 档', () => {
    expect(resolve('anthropic', 'claude-opus-4-5-20251101', 'max')).toEqual({
      maxOutputTokens: 64_000,
      providerOptions: { anthropic: { effort: 'high' } },
    });
  });

  it('Sonnet / Haiku 4.5 及更早版本不发送 effort，只给输出上限', () => {
    expect(resolve('anthropic', 'claude-sonnet-4-5', 'high')).toEqual({ maxOutputTokens: 64_000 });
    expect(resolve('anthropic', 'claude-haiku-4-5', 'high')).toEqual({ maxOutputTokens: 64_000 });
    expect(resolve('anthropic', 'claude-opus-4-1-20250805', 'high')).toEqual({ maxOutputTokens: 32_000 });
    expect(resolve('anthropic', 'claude-3-7-sonnet-latest', 'high')).toEqual({ maxOutputTokens: 64_000 });
    expect(resolve('anthropic', 'claude-3-5-haiku-20241022', 'high')).toEqual({ maxOutputTokens: 8192 });
    expect(resolve('anthropic', 'claude-3-haiku-20240307', 'high')).toEqual({ maxOutputTokens: 4096 });
  });

  it('无法识别的模型使用兜底输出上限且不发送 effort', () => {
    expect(resolve('anthropic', 'claude-next-preview', 'high')).toEqual({ maxOutputTokens: 64_000 });
    expect(resolve('anthropic', 'custom-proxy-model', 'high')).toEqual({ maxOutputTokens: 64_000 });
  });
});

describe('resolveModelRequestOptions / google', () => {
  it('Gemini 3 及之后使用 thinkingLevel，max 退到 high', () => {
    expect(resolve('gemini', 'gemini-3-flash-preview', 'max')).toEqual({
      maxOutputTokens: null,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'high' } } },
    });
    expect(resolve('google-vertex', 'gemini-3-pro', 'low').providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'low' } },
    });
  });

  it('Gemini 2.5 使用 thinkingBudget 换算', () => {
    expect(resolve('gemini', 'gemini-2.5-flash', 'low').providerOptions).toEqual({
      google: { thinkingConfig: { thinkingBudget: 1024 } },
    });
    expect(resolve('gemini', 'gemini-2.5-pro', 'max').providerOptions).toEqual({
      google: { thinkingConfig: { thinkingBudget: 24576 } },
    });
  });

  it('Gemini 1.x / 2.0 / Gemma 不发送 thinking 参数', () => {
    expect(resolve('gemini', 'gemini-2.0-flash', 'high')).toEqual({ maxOutputTokens: null });
    expect(resolve('gemini', 'gemini-1.5-pro', 'high')).toEqual({ maxOutputTokens: null });
    expect(resolve('gemini', 'gemma-3-27b-it', 'high')).toEqual({ maxOutputTokens: null });
  });
});

describe('resolveModelRequestOptions / amazon-bedrock', () => {
  it('Bedrock 上的 Claude 走 maxReasoningEffort 并按 Claude 规则给输出上限', () => {
    expect(resolve('amazon-bedrock', 'us.anthropic.claude-opus-4-6-v1:0', 'max')).toEqual({
      maxOutputTokens: 128_000,
      providerOptions: { bedrock: { reasoningConfig: { maxReasoningEffort: 'max' } } },
    });
    expect(resolve('amazon-bedrock', 'anthropic.claude-3-5-sonnet-20241022-v2:0', 'high')).toEqual({
      maxOutputTokens: 8192,
    });
  });

  it('Nova 2 及之后启用 reasoningConfig，max 退到 high；Nova 1 不发送', () => {
    expect(resolve('amazon-bedrock', 'us.amazon.nova-2-lite-v1:0', 'max').providerOptions).toEqual({
      bedrock: { reasoningConfig: { type: 'enabled', maxReasoningEffort: 'high' } },
    });
    expect(resolve('amazon-bedrock', 'amazon.nova-pro-v1:0', 'high')).toEqual({ maxOutputTokens: null });
  });

  it('gpt-oss 透传 reasoning effort，其他模型家族不发送', () => {
    expect(resolve('amazon-bedrock', 'openai.gpt-oss-120b-1:0', 'low').providerOptions).toEqual({
      bedrock: { reasoningConfig: { maxReasoningEffort: 'low' } },
    });
    expect(resolve('amazon-bedrock', 'meta.llama3-70b-instruct-v1:0', 'high')).toEqual({ maxOutputTokens: null });
  });
});
