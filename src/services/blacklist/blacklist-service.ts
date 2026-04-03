type BlacklistRule = {
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

type BlacklistDecision = {
  /** 当前是否阻断。 */
  blocked: boolean;
  /** 命中的规则 id。 */
  matchedRuleId: string | null;
};

/** 创建黑名单服务，统一收口规则过滤和 URL 匹配。 */
export const createBlacklistService = ({ rules }: { rules: BlacklistRule[] }) => {
  /** 仅保留运行时有效的规则。 */
  const activeRules = rules.filter((rule) => rule.enabled && rule.deletedAt === null);

  /** 判断单条规则是否命中。 */
  const matchesRule = (rule: BlacklistRule, url: string): boolean => {
    if (rule.type === 'domain') {
      return new URL(url).hostname.includes(rule.pattern);
    }

    if (rule.type === 'url-prefix') {
      return url.startsWith(rule.pattern);
    }

    try {
      return new RegExp(rule.pattern).test(url);
    } catch {
      return true;
    }
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
  };
};
