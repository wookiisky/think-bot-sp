import YAML from 'yaml';

import enRaw from '../../locales/en.yml?raw';
import zhRaw from '../../locales/zh-CN.yml?raw';

type LocaleCode = 'zh-CN' | 'en';
type LocaleResource = Record<string, string>;

const loadLocale = (raw: string): LocaleResource => YAML.parse(raw) as LocaleResource;

/** 语言资源仓储，负责静态资源加载、key 对齐和回退查询。 */
export const createLocaleRepository = () => {
  const resources: Record<LocaleCode, LocaleResource> = {
    'zh-CN': loadLocale(zhRaw),
    en: loadLocale(enRaw),
  };
  const zhKeys = Object.keys(resources['zh-CN']);
  const enKeys = Object.keys(resources.en);
  const missingKeys = zhKeys.filter((key) => !enKeys.includes(key)).concat(enKeys.filter((key) => !zhKeys.includes(key)));

  return {
    /** 加载语言资源。 */
    async loadResources() {
      return {
        locales: ['zh-CN', 'en'] as const,
        resources,
        missingKeys,
        t(key: string, locale: LocaleCode) {
          return resources[locale][key] ?? resources['zh-CN'][key] ?? key;
        },
      };
    },
  };
};
