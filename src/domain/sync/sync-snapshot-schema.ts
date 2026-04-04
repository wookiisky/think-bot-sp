import { z } from 'zod';

import { extensionConfigSchema } from '../config/config-schema';
import { conversationRecordSchema } from '../conversation/conversation-schema';
import { pageRecordSchema } from '../page/page-schema';
import { SYNC_SNAPSHOT_SCHEMA_VERSION } from '../../shared/schema-version';

/** 页面级墓碑记录。 */
export const syncTombstoneSchema = z.object({
  /** 被删除页面的归一化 URL。 */
  normalizedUrl: z.string().min(1),
  /** 删除时间。 */
  deletedAt: z.number().int().nonnegative(),
});

/** 本地同步状态。 */
export const syncStateSchema = z.object({
  /** 同步快照结构版本。 */
  schemaVersion: z.literal(SYNC_SNAPSHOT_SCHEMA_VERSION),
  /** 本地已确认的最近快照版本。 */
  snapshotVersion: z.number().int().nonnegative(),
  /** 已写入的页面级墓碑。 */
  tombstones: z.array(syncTombstoneSchema),
  /** 最近一次同步成功时间。 */
  lastSyncAt: z.number().int().nonnegative().nullable(),
});

/** 对外导出的完整同步快照。 */
export const syncSnapshotSchema = syncStateSchema.extend({
  /** 快照导出时间。 */
  exportedAt: z.number().int().nonnegative(),
  /** 当前完整配置。 */
  config: extensionConfigSchema,
  /** 当前页面集合。 */
  pages: z.array(pageRecordSchema),
  /** 当前会话集合。 */
  conversations: z.array(conversationRecordSchema),
});

/** 创建默认同步状态。 */
export const createDefaultSyncState = () =>
  syncStateSchema.parse({
    schemaVersion: SYNC_SNAPSHOT_SCHEMA_VERSION,
    snapshotVersion: 0,
    tombstones: [],
    lastSyncAt: null,
  });
