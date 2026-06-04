import { cn } from '../../lib/utils';
import { COMPACT_ROW_BUTTON_CLASS, COMPACT_SECTION_CLASS } from '../../ui/compact-layout';
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
    className="grid gap-1 self-start lg:sticky lg:top-2"
  >
    <div
      role="tablist"
      aria-orientation="vertical"
      className={cn(COMPACT_SECTION_CLASS, 'border border-border/70 p-1.5 ring-1 ring-foreground/6')}
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
              COMPACT_ROW_BUTTON_CLASS,
              'flex items-center gap-1.5 px-2 py-1.5 text-xs/relaxed font-medium',
              selected
                ? 'border-l-2 border-primary bg-primary/8 text-foreground'
                : 'border-l-2 border-transparent text-foreground hover:bg-muted/35 hover:text-foreground',
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
