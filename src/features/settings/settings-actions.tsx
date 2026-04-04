/* eslint-disable no-unused-vars */
import { Button } from '../../components/ui/button';
import { Icon } from '../../ui/icon';

type SettingsActionsProps = {
  /** 是否存在未保存更改。 */
  hasUnsavedChanges: boolean;
  /** 是否正在执行保存类操作。 */
  disabled: boolean;
  /** 保存动作。 */
  onSave(): void;
  /** 恢复默认动作。 */
  onReset(): void;
  /** 导入动作。 */
  onImport(): void;
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
  onReset,
  onImport,
  onExport,
  t,
}: SettingsActionsProps) => (
  <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid="settings-shell-actions">
      <Button type="button" onClick={onSave} disabled={disabled}>
        <Icon name="save" size={14} />
        {t('settings.save')}
      </Button>
      <Button type="button" variant="outline" onClick={onReset} disabled={disabled}>
        {t('settings.reset')}
      </Button>
      <Button type="button" variant="outline" onClick={onImport} disabled={disabled}>
        {t('settings.import')}
      </Button>
      <Button type="button" variant="outline" onClick={onExport} disabled={disabled}>
        {t('settings.export')}
      </Button>
    </div>
    {hasUnsavedChanges ? (
      <p className="m-0 text-right text-sm text-amber-700 dark:text-amber-300">{t('settings.unsavedChanges')}</p>
    ) : null}
  </div>
);
