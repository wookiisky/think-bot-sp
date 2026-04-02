import { useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
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

const fieldClassName =
  'w-full rounded-md border border-input bg-input/20 px-2 py-1.5 text-xs/relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

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
        <select
          aria-label="Provider"
          value={model.provider}
          disabled={disabled}
          onChange={(event) => updateModel({ provider: event.target.value as ModelConfig['provider'] })}
          className={fieldClassName}
        >
          <option value="openai-compatible">OpenAI Compatible</option>
          <option value="gemini">Gemini</option>
          <option value="azure-openai">Azure OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
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
