import { resolveModelReasoningEffort, resolvePromptTabParallelModelIds, type ExtensionConfig } from '../../domain/config/config-schema';
import { getSelectedBranch, type AssistantMessageRecord } from '../../domain/conversation/conversation-state';
import type { ChatDispatchServiceDeps, ChatStreamResult, DispatchLogger, InitialBranchPlan } from './dispatch-types';

/** 汇总多条分支会话的最终状态，供 loading 生命周期收口使用。 */
export const resolveAggregateStatus = (results: ChatStreamResult[]): ChatStreamResult['status'] => {
  if (results.some((result) => result.status === 'error')) {
    return 'error';
  }
  if (results.some((result) => result.status === 'done')) {
    return 'done';
  }
  return 'cancelled';
};

/**
 * 重跑某一轮时应沿用的模型：优先主分支，其次当前选中分支，最后回落到消息镜像。
 * 编辑重发与用户重试共用这一条规则，避免选中兄弟分支后两者挑出不同模型。
 */
export const resolveTurnModelId = (assistant: AssistantMessageRecord): string | null => {
  const branch = assistant.branches.find((item) => item.isPrimary) ?? getSelectedBranch(assistant);
  return branch?.modelId ?? assistant.modelId ?? null;
};

/** 把执行计划压成仓储需要的分支占位种子。 */
export const toInitialBranchSeeds = (plans: InitialBranchPlan[]) =>
  plans.map((plan) => ({
    id: plan.branchId,
    modelId: plan.modelId,
    modelLabel: plan.modelLabel,
    isPrimary: plan.isPrimary,
  }));

/** 为本轮首发生成初始并行分支计划，主模型始终排在第一位。 */
export const resolveInitialBranchPlans = async (input: {
  /** 依赖集合。 */
  deps: Pick<ChatDispatchServiceDeps, 'configRepository' | 'providerRegistry'>;
  /** 当前配置。 */
  config: ExtensionConfig;
  /** promptTab 稳定 id。 */
  promptTabId: string;
  /** 主模型 id。 */
  primaryModelId: string;
  /** 分支 id 生成器。 */
  createMessageId: () => string;
  /** 本轮请求是否携带图片。 */
  hasImages: boolean;
  /** 日志。 */
  logger: Pick<DispatchLogger, 'warn'>;
}): Promise<InitialBranchPlan[]> => {
  const seen = new Set<string>();
  const orderedModelIds = [input.primaryModelId, ...resolvePromptTabParallelModelIds(input.config, input.promptTabId)].filter((modelId) => {
    if (seen.has(modelId)) {
      return false;
    }
    seen.add(modelId);
    return true;
  });

  const plans = await Promise.all(
    orderedModelIds.map(async (modelId, index) => {
      const model = await input.deps.configRepository.getModelById(modelId);
      if (!model) {
        throw new Error(`model not found: ${modelId}`);
      }

      const resolvedModel = input.deps.providerRegistry.resolveProviderModel(model, {
        reasoningEffort: resolveModelReasoningEffort(input.config.basic, model),
      });
      return {
        branchId: input.createMessageId(),
        modelId,
        modelLabel: resolvedModel.modelLabel,
        isPrimary: index === 0,
        model,
        resolvedModel,
      };
    }),
  );
  if (!input.hasImages) {
    return plans;
  }
  // 图片能力必须在任何持久化之前校验：主模型不支持直接失败，并行模型不支持则跳过该分支。
  if (plans[0] && !plans[0].resolvedModel.supportsImages) {
    throw new Error('model does not support images');
  }
  return plans.filter((plan) => {
    if (plan.resolvedModel.supportsImages) {
      return true;
    }
    input.logger.warn('branch.skipped.no_images', { promptTab: input.promptTabId, modelId: plan.modelId });
    return false;
  });
};
