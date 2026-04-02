import { createLocaleRepository } from '../../repositories/locale-repository';

type LocaleCode = 'zh-CN' | 'en';

type LocaleResources = Awaited<ReturnType<ReturnType<typeof createLocaleRepository>['loadResources']>>;

/** 语言服务，负责缓存静态语言资源，供设置页即时预览。 */
export const createLocaleService = (
  localeRepository = createLocaleRepository(),
) => {
  let resources: LocaleResources | null = null;

  return {
    /** 预加载并缓存语言资源。 */
    async loadResources() {
      if (!resources) {
        resources = await localeRepository.loadResources();
      }

      return resources;
    },

    /** 读取设置页标题。 */
    async getSettingsTitle(locale: LocaleCode) {
      const bundle = await this.loadResources();
      return bundle.t('settings.title', locale);
    },
  };
};
