import type { ExtensionConfig } from '../../domain/config/config-schema';
import type { IconName } from '../../ui/icon';

export type SettingsSection = 'basic' | 'promptTabs' | 'models' | 'display' | 'sync' | 'blacklist';

export type SettingsViewError = {
  /** 展示给用户的错误标题。 */
  title: string;
  /** 展示给用户的错误正文。 */
  message: string;
};

export type SettingsSectionMeta = {
  /** 分栏稳定 id。 */
  id: SettingsSection;
  /** 国际化 key。 */
  labelKey: string;
  /** 导航图标。 */
  icon: IconName;
};

export const settingsSections: SettingsSectionMeta[] = [
  { id: 'basic', labelKey: 'settings.basic', icon: 'settings' },
  { id: 'promptTabs', labelKey: 'settings.promptTabs', icon: 'bolt' },
  { id: 'models', labelKey: 'settings.languageModels', icon: 'provider' },
  { id: 'display', labelKey: 'settings.display', icon: 'palette' },
  { id: 'sync', labelKey: 'settings.syncPanel', icon: 'sync' },
  { id: 'blacklist', labelKey: 'settings.blacklistSettings', icon: 'block' },
];

/** 比较已保存配置和草稿配置是否存在差异。 */
export const hasUnsavedChanges = (savedConfig: ExtensionConfig, draftConfig: ExtensionConfig) =>
  JSON.stringify(savedConfig) !== JSON.stringify(draftConfig);
