import { DEFAULT_BLACKLIST_RULES, isBuiltInBlacklistRuleId } from '../../domain/config/config-schema';

export type BlacklistRule = {
  /** 规则稳定 id。 */
  id: string;
  /** 规则类型。 */
  type: 'domain' | 'url-prefix' | 'regex';
  /** 匹配模式。 */
  pattern: string;
  /** 是否启用。 */
  enabled: boolean;
  /** 软删除时间。 */
  deletedAt: number | null;
};

export type BlacklistDecision = {
  /** 当前是否阻断。 */
  blocked: boolean;
  /** 命中的规则 id。 */
  matchedRuleId: string | null;
};

type BlacklistTestResult = {
  /** 当前测试输入是否合法。 */
  valid: boolean;
  /** 当前是否命中。 */
  matched: boolean;
  /** 错误信息。 */
  errorMessage: string | null;
};

/** 预编译黑名单规则，统一收敛规则校验。 */
const compileRule = (rule: BlacklistRule) => {
  if (rule.type !== 'regex') {
    return null;
  }

  try {
    return new RegExp(rule.pattern);
  } catch {
    return null;
  }
};

/** 校验黑名单规则是否允许持久化。 */
export const assertBlacklistRulesPersistable = (rules: BlacklistRule[]) => {
  for (const rule of rules) {
    if (rule.deletedAt !== null || rule.type !== 'regex') {
      continue;
    }

    if (!compileRule(rule)) {
      throw new Error(`黑名单规则 ${rule.id} 的正则表达式无效`);
    }
  }
};

/** 精确匹配域名或其子域名，避免 includes 误伤。 */
const matchesDomain = (hostname: string, pattern: string) =>
  hostname === pattern || hostname.endsWith(`.${pattern}`);

/** 创建黑名单服务，统一收口规则过滤和 URL 匹配。 */
export const createBlacklistService = ({ rules }: { rules: BlacklistRule[] }) => {
  /** 仅保留运行时有效的规则。 */
  const activeRules = rules.filter((rule) => rule.enabled && rule.deletedAt === null);

  /** 判断单条规则是否命中。 */
  const matchesRule = (rule: BlacklistRule, url: string): boolean => {
    const parsedUrl = new URL(url);

    if (rule.type === 'domain') {
      return matchesDomain(parsedUrl.hostname, rule.pattern);
    }

    if (rule.type === 'url-prefix') {
      return parsedUrl.href.startsWith(rule.pattern);
    }

    const regex = compileRule(rule);
    if (!regex) {
      return true;
    }

    return regex.test(parsedUrl.href);
  };

  return {
    /** 检查目标 URL 是否命中黑名单。 */
    checkUrl(url: string): BlacklistDecision {
      for (const rule of activeRules) {
        if (matchesRule(rule, url)) {
          return {
            blocked: true,
            matchedRuleId: rule.id,
          };
        }
      }

      return {
        blocked: false,
        matchedRuleId: null,
      };
    },

    /** 测试单条规则与目标 URL 的匹配结果。 */
    testPattern(rule: BlacklistRule, url: string): BlacklistTestResult {
      try {
        const matched = matchesRule(
          {
            ...rule,
            enabled: true,
            deletedAt: null,
          },
          url,
        );
        const valid = rule.type !== 'regex' || compileRule(rule) !== null;

        return {
          valid,
          matched,
          errorMessage: valid ? null : '正则表达式无效，运行时会按阻断处理',
        };
      } catch (error) {
        return {
          valid: false,
          matched: false,
          errorMessage: error instanceof Error ? error.message : '无效的 URL',
        };
      }
    },

    /** 仅恢复系统内置规则，不改动用户自定义规则。 */
    resetDefaults(): BlacklistRule[] {
      const customRules = rules.filter((rule) => !isBuiltInBlacklistRuleId(rule.id));
      const restoredBuiltInRules = DEFAULT_BLACKLIST_RULES.map((rule) => ({ ...rule }));
      return [...customRules, ...restoredBuiltInRules];
    },
  };
};
