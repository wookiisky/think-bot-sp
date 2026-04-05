import { useEffect, useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { ModelConfig } from '../../domain/config/config-schema';
import { isModelConfigComplete } from '../../domain/config/config-schema';

type ModelFormProps = {
  /** 当前编辑的模型配置。 */
  model: ModelConfig;
  /** 配置变更回调。 */
  onChange(nextModel: ModelConfig): void;
  /** 是否禁用表单交互。 */
  disabled?: boolean;
};

/** 模型配置表单，负责 Provider 差异字段、API Key 显示切换和完整性提示。 */
export const ModelForm = ({ model, onChange, disabled = false }: ModelFormProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [toolsInput, setToolsInput] = useState(model.tools.join(', '));
  const complete = isModelConfigComplete(model);
  const showBaseUrl = model.provider === 'openai-compatible' || model.provider === 'azure-openai';
  const showDeployment = model.provider === 'azure-openai';

  useEffect(() => {
    setToolsInput(model.tools.join(', '));
  }, [model.id]);

  const updateModel = (patch: Partial<ModelConfig>) => {
    onChange({
      ...model,
      ...patch,
    });
  };

  return (
    <section className="grid gap-4" aria-label="模型表单">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{model.name}</h3>
        <Badge variant={complete ? 'secondary' : 'destructive'}>{complete ? '配置完整' : '配置不完整'}</Badge>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium">模型名称</span>
        <Input
          aria-label="模型名称"
          value={model.name}
          disabled={disabled}
          onChange={(event) => updateModel({ name: event.target.value })}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">提供方</span>
        <Select
          value={model.provider}
          disabled={disabled}
          onValueChange={(value) => updateModel({ provider: value as ModelConfig['provider'] })}
        >
          <SelectTrigger aria-label="Provider" className="w-full">
            <SelectValue placeholder="选择 Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          aria-label="启用模型"
          type="checkbox"
          checked={model.enabled}
          disabled={disabled}
          onChange={(event) => updateModel({ enabled: event.target.checked })}
        />
        <span className="font-medium">启用模型</span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Model</span>
        <Input
          aria-label="Model"
          value={model.model}
          disabled={disabled}
          onChange={(event) => updateModel({ model: event.target.value })}
        />
      </label>

      {showBaseUrl ? (
        <label className="grid gap-2">
          <span className="text-sm font-medium">Base URL</span>
          <Input
            aria-label="Base URL"
            value={model.baseUrl}
            disabled={disabled}
            onChange={(event) => updateModel({ baseUrl: event.target.value })}
          />
        </label>
      ) : null}

      {showDeployment ? (
        <label className="grid gap-2">
          <span className="text-sm font-medium">Deployment</span>
          <Input
            aria-label="Deployment"
            value={model.deployment}
            disabled={disabled}
            onChange={(event) => updateModel({ deployment: event.target.value })}
          />
        </label>
      ) : null}

      <label className="grid gap-2">
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

      <label className="grid gap-2">
        <span className="text-sm font-medium">Thinking Budget</span>
        <Input
          aria-label="Thinking Budget"
          type="number"
          value={model.thinkingBudget === null ? '' : String(model.thinkingBudget)}
          disabled={disabled}
          onChange={(event) =>
            updateModel({
              thinkingBudget: event.target.value.trim() ? Number(event.target.value) : null,
            })
          }
        />
      </label>

      <label className="grid gap-2">
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

      <label className="grid gap-2">
        <span className="text-sm font-medium">Tools</span>
        <Input
          aria-label="Tools"
          value={toolsInput}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.value;
            setToolsInput(nextValue);
            updateModel({
              tools: nextValue
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            });
          }}
        />
      </label>

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

      <label className="grid gap-2">
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
          <Button type="button" variant="outline" onClick={() => setShowApiKey((value) => !value)} disabled={disabled}>
            {showApiKey ? '隐藏' : '显示'}
          </Button>
        </div>
      </label>
    </section>
  );
};
