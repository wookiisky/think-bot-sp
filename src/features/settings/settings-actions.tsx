import { useRef } from 'react';

import { Button } from '../../components/ui/button';
import { Icon } from '../../ui/icon';

type SettingsActionsProps = {
  /** 是否存在未保存更改。 */
  hasUnsavedChanges: boolean;
  /** 是否正在执行保存类操作。 */
  disabled: boolean;
  /** 保存动作。 */
  onSave(): void;
  /** 保存并同步动作。 */
  onSaveAndSync(): void;
  /** 恢复默认动作。 */
  onReset(): void;
  /** 导入动作。 */
  onImport(file: File): void;
  /** 导出动作。 */
  onExport(): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 设置页顶部动作区。 */
export const SettingsActions = ({
  hasUnsavedChanges,
  disabled,
  onSave,
  onSaveAndSync,
  onReset,
  onImport,
  onExport,
  t,
}: SettingsActionsProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1" data-testid="settings-shell-actions">
        <Button type="button" size="sm" onClick={onSave} disabled={disabled}>
          <Icon name="save" size={12} />
          {t('settings.save')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSaveAndSync} disabled={disabled}>
          {t('settings.saveAndSync')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReset} disabled={disabled}>
          {t('settings.reset')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
          {t('settings.import')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          aria-label={t('settings.import')}
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.currentTarget.value = '';
            if (!file) {
              return;
            }
            onImport(file);
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={onExport} disabled={disabled}>
          {t('settings.export')}
        </Button>
      </div>
      {hasUnsavedChanges ? (
        <p className="m-0 justify-self-end border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 text-right text-xs/relaxed text-amber-700 dark:text-amber-300">
          {t('settings.unsavedChanges')}
        </p>
      ) : null}
    </div>
  );
};
