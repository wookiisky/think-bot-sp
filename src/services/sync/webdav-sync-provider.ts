import type { ExtensionConfig } from '../../domain/config/config-schema';
import { syncSnapshotSchema } from '../../domain/sync/sync-snapshot-schema';
import type { SyncSnapshot } from '../../domain/sync/sync-snapshot-schema';
import { createSyncTranslator, type SyncTranslator } from './sync-copy';

type WebdavSyncConfig = ExtensionConfig['sync'];

const createAuthHeader = (username: string, password: string) => ({
  Authorization: `Basic ${btoa(`${username}:${password}`)}`,
});

/** 解析远端 WebDAV 文件内容。 */
const parseSnapshotPayload = (payload: string, t: SyncTranslator) => {
  if (!payload.trim()) {
    return null;
  }

  try {
    return syncSnapshotSchema.parse(JSON.parse(payload));
  } catch {
    throw new Error(t('sync.message.webdavInvalidSnapshot'));
  }
};

/** WebDAV 同步 provider。 */
export const createWebdavSyncProvider = (fetchImpl: typeof fetch, t: SyncTranslator = createSyncTranslator()) => ({
  /** 测试 WebDAV 连接。 */
  async testConnection(sync: WebdavSyncConfig) {
    if (!sync.webdavUrl.trim()) {
      throw new Error(t('sync.message.webdavUrlRequired'));
    }

    const response = await fetchImpl(sync.webdavUrl, {
      method: 'HEAD',
      headers: createAuthHeader(sync.webdavUsername, sync.webdavPassword),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(t('sync.message.webdavAuthFailed'));
    }
    if (![200, 201, 204, 404, 405].includes(response.status)) {
      throw new Error(t('sync.message.webdavConnectionFailed', { status: response.status }));
    }

    return {
      provider: 'webdav' as const,
      ok: true,
      message: response.status === 404 ? t('sync.message.webdavCreateOnSync') : t('sync.message.webdavConnected'),
    };
  },

  /** 读取远端 WebDAV 快照。 */
  async readSnapshot(sync: WebdavSyncConfig) {
    if (!sync.webdavUrl.trim()) {
      throw new Error(t('sync.message.webdavUrlRequired'));
    }

    const response = await fetchImpl(sync.webdavUrl, {
      method: 'GET',
      headers: createAuthHeader(sync.webdavUsername, sync.webdavPassword),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(t('sync.message.webdavAuthFailed'));
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(t('sync.message.webdavReadFailed', { status: response.status }));
    }

    return parseSnapshotPayload(await response.text(), t);
  },

  /** 把当前配置快照写入 WebDAV 目标。 */
  async syncNow(sync: WebdavSyncConfig, snapshot: SyncSnapshot) {
    if (!sync.webdavUrl.trim()) {
      throw new Error(t('sync.message.webdavUrlRequired'));
    }

    const payload = JSON.stringify(snapshot, null, 2);
    const response = await fetchImpl(sync.webdavUrl, {
      method: 'PUT',
      headers: {
        ...createAuthHeader(sync.webdavUsername, sync.webdavPassword),
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(t('sync.message.webdavAuthFailed'));
    }
    if (!response.ok) {
      throw new Error(t('sync.message.webdavSyncFailed', { status: response.status }));
    }

    return {
      provider: 'webdav' as const,
      snapshotBytes: payload.length,
    };
  },
});
