import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MultiSelectPopover } from '../../components/ui/multi-select-popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  getDefaultModelBaseUrl,
  getDefaultModelTools,
  getResolvedReasoningEffort,
  providerSupportsGoogleTools,
  providerSupportsReasoningEffort,
  type ModelConfig,
} from '../../domain/config/config-schema';

type ModelFormProps = {
  /** 当前编辑的模型配置。 */
  model: ModelConfig;
  /** 配置变更回调。 */
  onChange(nextModel: ModelConfig): void;
  /** 测试当前模型。 */
  onTest?(): void;
  /** 是否禁用表单交互。 */
  disabled?: boolean;
  /** 是否正在测试。 */
  testing?: boolean;
  /** 是否展示表单头部。 */
  showHeader?: boolean;
  /** 是否展示启用模型控件。 */
  showEnabledField?: boolean;
};

/** 模型配置表单，负责 Provider 差异字段、API Key 显示切换和完整性提示。 */
export const ModelForm = ({
  model,
  onChange,
  onTest,
  disabled = false,
  testing = false,
  showHeader = true,
  showEnabledField = true,
}: ModelFormProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const showReasoningEffort = providerSupportsReasoningEffort(model.provider);
  const showGoogleTools = providerSupportsGoogleTools(model.provider);
  const showDeployment = model.provider === 'azure-openai';
  const showRegion = model.provider === 'amazon-bedrock';
  const showVertexFields = model.provider === 'google-vertex';

  useEffect(() => {
    setShowApiKey(false);
  }, [model.id]);

  const updateModel = (patch: Partial<ModelConfig>) => {
    onChange({
      ...model,
      ...patch,
    });
  };

  const toolOptions = [
    {
      value: 'url_context',
      label: 'URL Context',
    },
    {
      value: 'google_search',
      label: 'Grounding with Google Search',
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2" aria-label="模型表单">
      {showHeader ? <h3 className="text-sm font-semibold md:col-span-2">{model.name}</h3> : null}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">模型名称</span>
        <Input
          aria-label="模型名称"
          value={model.name}
          disabled={disabled}
          onChange={(event) => updateModel({ name: event.target.value })}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">提供方</span>
        <Select
          value={model.provider}
          disabled={disabled}
          onValueChange={(value) => {
            const provider = value as ModelConfig['provider'];
            updateModel({
              provider,
              baseUrl: getDefaultModelBaseUrl(provider),
              tools: getDefaultModelTools(provider),
              reasoningEffort: providerSupportsReasoningEffort(provider) ? getResolvedReasoningEffort(model) : undefined,
            });
          }}
        >
          <SelectTrigger aria-label="Provider" size="sm" className="w-full">
            <SelectValue placeholder="选择 Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="amazon-bedrock">Amazon Bedrock</SelectItem>
            <SelectItem value="google-vertex">Google Vertex</SelectItem>
          </SelectContent>
        </Select>
      </label>

      {showEnabledField ? (
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            aria-label="启用模型"
            type="checkbox"
            checked={model.enabled}
            disabled={disabled}
            onChange={(event) => updateModel({ enabled: event.target.checked })}
          />
          <span className="font-medium">启用模型</span>
        </label>
      ) : null}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Base URL</span>
        <Input
          aria-label="Base URL"
          value={model.baseUrl}
          disabled={disabled}
          onChange={(event) => updateModel({ baseUrl: event.target.value })}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">API Key</span>
        <div className="flex items-center gap-2">
          <Input
            aria-label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={model.apiKey}
            disabled={disabled}
            onChange={(event) => updateModel({ apiKey: event.target.value })}
            autoComplete="off"
          />
          <Button size="sm" type="button" variant="outline" onClick={() => setShowApiKey((value) => !value)} disabled={disabled}>
            {showApiKey ? '隐藏' : '显示'}
          </Button>
        </div>
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{showDeployment ? 'Deployment' : 'Model'}</span>
        <Input
          aria-label={showDeployment ? 'Deployment' : 'Model'}
          value={showDeployment ? model.deployment : model.model}
          disabled={disabled}
          onChange={(event) =>
            updateModel(showDeployment ? { deployment: event.target.value } : { model: event.target.value })
          }
        />
      </label>

      {showRegion ? (
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Region</span>
          <Input
            aria-label="Region"
            value={model.region ?? ''}
            disabled={disabled}
            onChange={(event) => updateModel({ region: event.target.value })}
          />
        </label>
      ) : null}

      {showVertexFields ? (
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Project</span>
          <Input
            aria-label="Project"
            value={model.project ?? ''}
            disabled={disabled}
            onChange={(event) => updateModel({ project: event.target.value })}
          />
        </label>
      ) : null}

      {showVertexFields ? (
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Location</span>
          <Input
            aria-label="Location"
            value={model.location ?? ''}
            disabled={disabled}
            onChange={(event) => updateModel({ location: event.target.value })}
          />
        </label>
      ) : null}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Max Output Tokens</span>
        <Input
          aria-label="Max Output Tokens"
          type="number"
          value={model.maxOutputTokens === null ? '' : String(model.maxOutputTokens)}
          disabled={disabled}
          onChange={(event) =>
            updateModel({
              maxOutputTokens: event.target.value.trim() ? Number(event.target.value) : null,
            })
          }
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Temperature</span>
        <Input
          aria-label="Temperature"
          type="number"
          step="0.1"
          value={String(model.temperature)}
          disabled={disabled}
          onChange={(event) => updateModel({ temperature: Number(event.target.value || '0') })}
        />
      </label>

      {showReasoningEffort ? (
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Reasoning Effort</span>
          <Select
            value={getResolvedReasoningEffort(model)}
            disabled={disabled}
            onValueChange={(value) => updateModel({ reasoningEffort: value as ModelConfig['reasoningEffort'] })}
          >
            <SelectTrigger aria-label="Reasoning Effort" size="sm" className="w-full">
              <SelectValue placeholder="Reasoning Effort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="max">Max</SelectItem>
            </SelectContent>
          </Select>
        </label>
      ) : null}

      {showGoogleTools ? (
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-sm font-medium">Tools</span>
          <MultiSelectPopover
            label="Tools"
            placeholder="选择工具"
            summaryTemplate="已选择 {count} 项工具"
            options={toolOptions}
            values={model.tools}
            emptyText="暂无工具"
            disabled={disabled}
            onChange={(nextValues) => updateModel({ tools: nextValues })}
          />
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          aria-label="支持图片输入"
          type="checkbox"
          checked={model.supportsImages}
          disabled={disabled}
          onChange={(event) => updateModel({ supportsImages: event.target.checked })}
        />
        <span className="font-medium">支持图片输入</span>
      </label>

      <div className="flex items-center justify-end md:col-span-2">
        <Button size="sm" type="button" variant="outline" onClick={onTest} disabled={disabled || !onTest}>
          {testing ? '测试中...' : '测试模型'}
        </Button>
      </div>
    </section>
  );
};
