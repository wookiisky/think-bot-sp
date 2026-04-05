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
    className="grid gap-2 self-start lg:sticky lg:top-6"
  >
    <div
      role="tablist"
      aria-orientation="vertical"
      className="grid gap-2 rounded-[28px] border border-border/70 bg-card/85 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur ring-1 ring-foreground/6"
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
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-all',
              selected
                ? 'bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_oklch,var(--color-primary)_74%,white))] text-primary-foreground shadow-lg shadow-primary/15'
                : 'bg-transparent text-foreground hover:bg-muted/70 hover:text-foreground',
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
