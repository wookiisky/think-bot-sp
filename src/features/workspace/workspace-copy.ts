import { createLocaleService } from '../../services/i18n/locale-service';
import type { PromptTabStatusKind } from './workspace-state';

/** 工作台支持的语言代码。 */
export type WorkspaceLocaleCode = 'zh-CN' | 'en';

/** 工作台翻译函数。 */
export type WorkspaceTranslator = (_key: string) => string;

const localeService = createLocaleService();

/** 加载工作台语言资源。 */
export const loadWorkspaceLocaleResources = () => localeService.loadResources();

/** 生成工作台翻译函数。 */
export const createWorkspaceTranslator = (
  resources: Awaited<ReturnType<typeof localeService.loadResources>> | null,
  locale: WorkspaceLocaleCode,
): WorkspaceTranslator => (key) => resources?.t(key, locale) ?? resources?.t(key, 'zh-CN') ?? key;

/** 提示标签状态文案 key。 */
export const getPromptTabStatusLabelKey = (status: PromptTabStatusKind) => {
  switch (status) {
    case 'loading':
      return 'workspace.promptStatus.loading';
    case 'auto-running':
      return 'workspace.promptStatus.autoRunning';
    case 'auto-error':
      return 'workspace.promptStatus.autoError';
    case 'auto-done':
      return 'workspace.promptStatus.autoDone';
    case 'ready':
      return 'workspace.promptStatus.ready';
    case 'idle':
    default:
      return '';
  }
};

