import type { createLogger } from '../logger/logger';
import { EXTENSION_PAGES } from '../../shared/extension-pages';

type RuntimeWithOptionsPage = {
  /** 打开扩展设置页。 */
  openOptionsPage: () => Promise<void> | void;
};

type OptionsPageLogger = Pick<ReturnType<typeof createLogger>, 'info'>;

type OpenOptionsPageDependencies = {
  /** 浏览器 runtime 能力。 */
  runtime: RuntimeWithOptionsPage;
  /** 导航日志。 */
  logger: OptionsPageLogger;
};

/** 统一打开设置页，保证设置页始终以扩展独立 tab 形式展示。 */
export const openOptionsPage = async ({ runtime, logger }: OpenOptionsPageDependencies) => {
  logger.info('settings.open.requested', {
    page: EXTENSION_PAGES.options,
  });
  await runtime.openOptionsPage();
};
