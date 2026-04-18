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
    className="grid gap-1.5 self-start lg:sticky lg:top-4"
  >
    <div
      role="tablist"
      aria-orientation="vertical"
      className="grid gap-1.5 rounded-[24px] border border-border/70 bg-card/85 p-2.5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur ring-1 ring-foreground/6"
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
            data-section-icon={section.icon}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs/relaxed font-medium transition-all',
              selected
                ? 'bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_oklch,var(--color-primary)_74%,white))] text-primary-foreground shadow-lg shadow-primary/15'
                : 'bg-transparent text-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            onClick={() => onSectionChange(section.id)}
          >
            <Icon name={section.icon} size={14} />
            <span className="truncate">{t(section.labelKey)}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
