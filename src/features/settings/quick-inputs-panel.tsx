import { useState } from 'react';

type QuickInputPreview = {
  /** 快捷输入 id。 */
  id: string;
  /** 快捷输入名称。 */
  name: string;
  /** 快捷输入提示词预览。 */
  prompt: string;
};

type QuickInputsPanelProps = {
  /** 快捷输入列表。 */
  quickInputs: QuickInputPreview[];
};

/** 快捷输入最小折叠预览区。 */
export const QuickInputsPanel = ({ quickInputs }: QuickInputsPanelProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section aria-label="快捷输入预览">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>快捷输入</h2>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          style={{
            border: '1px solid #d1d5db',
            background: '#fff',
            borderRadius: '999px',
            padding: '0.4rem 0.75rem',
            cursor: 'pointer',
          }}
        >
          {collapsed ? '展开预览' : '收起预览'}
        </button>
      </header>

      {!collapsed ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'grid', gap: '0.75rem' }}>
          {quickInputs.length > 0 ? (
            quickInputs.map((item) => (
              <li
                key={item.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '14px',
                  padding: '0.9rem 1rem',
                  background: '#fafafa',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '0.35rem' }}>{item.name}</strong>
                <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.5 }}>{item.prompt}</p>
              </li>
            ))
          ) : (
            <li style={{ color: '#6b7280' }}>暂无快捷输入预览</li>
          )}
        </ul>
      ) : null}
    </section>
  );
};
