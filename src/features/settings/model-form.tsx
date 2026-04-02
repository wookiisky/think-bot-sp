import { useState } from 'react';

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
    <section style={{ display: 'grid', gap: '0.9rem' }} aria-label="模型表单">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{model.name}</h3>
        <span
          style={{
            padding: '0.35rem 0.7rem',
            borderRadius: '999px',
            background: complete ? '#dcfce7' : '#fee2e2',
            color: complete ? '#166534' : '#991b1b',
            fontSize: '0.84rem',
          }}
        >
          {complete ? '配置完整' : '配置不完整'}
        </span>
      </div>

      <label style={{ display: 'grid', gap: '0.4rem' }}>
        <span style={{ fontWeight: 600 }}>提供方</span>
        <select
          aria-label="Provider"
          value={model.provider}
          disabled={disabled}
          onChange={(event) => updateModel({ provider: event.target.value as ModelConfig['provider'] })}
          style={{ borderRadius: '12px', border: '1px solid #d1d5db', padding: '0.65rem 0.8rem', background: '#fff' }}
        >
          <option value="openai-compatible">OpenAI Compatible</option>
          <option value="gemini">Gemini</option>
          <option value="azure-openai">Azure OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>

      {showBaseUrl ? (
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600 }}>Base URL</span>
          <input
            aria-label="Base URL"
            value={model.baseUrl}
            disabled={disabled}
            onChange={(event) => updateModel({ baseUrl: event.target.value })}
            style={{ borderRadius: '12px', border: '1px solid #d1d5db', padding: '0.65rem 0.8rem', background: '#fff' }}
          />
        </label>
      ) : null}

      {showDeployment ? (
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600 }}>Deployment</span>
          <input
            aria-label="Deployment"
            value={model.deployment}
            disabled={disabled}
            onChange={(event) => updateModel({ deployment: event.target.value })}
            style={{ borderRadius: '12px', border: '1px solid #d1d5db', padding: '0.65rem 0.8rem', background: '#fff' }}
          />
        </label>
      ) : null}

      <label style={{ display: 'grid', gap: '0.4rem' }}>
        <span style={{ fontWeight: 600 }}>API Key</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            aria-label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={model.apiKey}
            disabled={disabled}
            onChange={(event) => updateModel({ apiKey: event.target.value })}
            autoComplete="off"
            style={{ flex: 1, borderRadius: '12px', border: '1px solid #d1d5db', padding: '0.65rem 0.8rem', background: '#fff' }}
          />
          <button
            type="button"
            onClick={() => setShowApiKey((value) => !value)}
            disabled={disabled}
            style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: '999px', padding: '0.55rem 0.8rem', cursor: 'pointer' }}
          >
            {showApiKey ? '隐藏' : '显示'}
          </button>
        </div>
      </label>
    </section>
  );
};
