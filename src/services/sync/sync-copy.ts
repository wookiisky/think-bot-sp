import type { ExtensionConfig } from '../../domain/config/config-schema';
import { createLocaleService } from '../i18n/locale-service';

export type SyncTranslator = (key: string, values?: Record<string, string | number>) => string;

const localeService = createLocaleService();

/** 为一次同步操作绑定语言，避免并发连接测试之间串用语言。 */
export const createSyncTranslator = (language: ExtensionConfig['basic']['language'] = 'zh-CN'): SyncTranslator => {
  const resources = localeService.loadResources();
  return (key, values = {}) => {
    let text = resources.t(key, language);
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  };
};
