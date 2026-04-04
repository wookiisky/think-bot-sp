/* eslint-disable no-unused-vars */
import { cn } from '../../lib/utils';
import { Icon } from '../../ui/icon';
import { settingsSections, type SettingsSection } from './settings-shell-state';

type SettingsNavProps = {
  /** 当前激活分栏。 */
  activeSection: SettingsSection;
  /** 切换分栏回调。 */
  onSectionChange(section: SettingsSection): void;
  /** 文案翻译函数。 */
  t(key: string): string;
};

/** 设置页左侧导航。 */
export const SettingsNav = ({ activeSection, onSectionChange, t }: SettingsNavProps) => (
  <nav
    aria-label={t('settings.nav')}
    data-testid="settings-shell-nav"
    className="grid gap-2 self-start"
  >
    <div
      role="tablist"
      aria-orientation="vertical"
      className="grid gap-2 rounded-3xl border border-border/70 bg-card/80 p-3 shadow-sm ring-1 ring-foreground/8"
    >
      {settingsSections.map((section) => {
        const selected = section.id === activeSection;
        return (
          <button
            key={section.id}
            id={`settings-tab-${section.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`settings-panel-${section.id}`}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-colors',
              selected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-transparent text-foreground hover:bg-muted/70',
            )}
            onClick={() => onSectionChange(section.id)}
          >
            <Icon name={section.icon} size={16} />
            <span>{t(section.labelKey)}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
