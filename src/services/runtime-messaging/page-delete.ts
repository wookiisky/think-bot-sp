type ConfigRepository = {
  /** 读取当前配置。 */
  getConfig(): Promise<{
    sync: {
      enabled: boolean;
      provider: string;
    };
  }>;
};

type SyncRepository = {
  /** 追加页面级墓碑。 */
  appendPageTombstone(input: { normalizedUrl: string; deletedAt: number }): Promise<void>;
};

type PageRepository = {
  /** 级联删除页面本地数据。 */
  deletePage(normalizedUrl: string): Promise<void>;
};

/** 页面删除模式。 */
export type PageDeleteMode = 'hard' | 'soft';

/** 按当前同步配置执行页面删除。 */
export const deletePageWithPolicy = async ({
  normalizedUrl,
  pageRepository,
  configRepository,
  syncRepository,
  now,
}: {
  /** 归一化页面 URL。 */
  normalizedUrl: string;
  /** 页面仓储。 */
  pageRepository: PageRepository;
  /** 配置仓储。 */
  configRepository?: ConfigRepository;
  /** 同步仓储。 */
  syncRepository?: SyncRepository;
  /** 当前时间。 */
  now: () => number;
}): Promise<PageDeleteMode> => {
  const config = configRepository ? await configRepository.getConfig() : null;
  const deleteMode: PageDeleteMode = config && config.sync.enabled && config.sync.provider !== 'none' ? 'soft' : 'hard';

  if (deleteMode === 'soft') {
    if (!syncRepository) {
      throw new Error('sync repository is required for soft delete');
    }
    await syncRepository.appendPageTombstone({
      normalizedUrl,
      deletedAt: now(),
    });
  }

  await pageRepository.deletePage(normalizedUrl);
  return deleteMode;
};
