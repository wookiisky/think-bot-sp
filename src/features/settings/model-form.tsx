import { useState } from 'react';

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
  onChange: (nextModel: ModelConfig) => void;
  /** 是否禁用表单交互。 */
  disabled?: boolean;
};

/** 模型配置表单，负责 Provider 差异字段、API Key 显示切换和完整性提示。 */
export const ModelForm = ({ model, onChange, disabled = false }: ModelFormProps) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const complete = isModelConfigComplete(model);
  const showBaseUrl = model.provider === 'openai-compatible' || model.provider === 'azure-openai';
  const showDeployment = model.provider === 'azure-openai';

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
