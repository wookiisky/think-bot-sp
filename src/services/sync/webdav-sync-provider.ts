import type { ExtensionConfig } from '../../domain/config/config-schema';
import { syncSnapshotSchema } from '../../domain/sync/sync-snapshot-schema';
import type { SyncSnapshot } from '../../domain/sync/sync-snapshot-schema';

type WebdavSyncConfig = ExtensionConfig['sync'];

const createAuthHeader = (username: string, password: string) => ({
  Authorization: `Basic ${btoa(`${username}:${password}`)}`,
});

/** 解析远端 WebDAV 文件内容。 */
const parseSnapshotPayload = (payload: string) => {
  if (!payload.trim()) {
    return null;
  }

  try {
    return syncSnapshotSchema.parse(JSON.parse(payload));
  } catch {
    throw new Error('WebDAV 远端快照格式非法');
  }
};

/** WebDAV 同步 provider。 */
export const createWebdavSyncProvider = (fetchImpl: typeof fetch) => ({
  /** 测试 WebDAV 连接。 */
  async testConnection(sync: WebdavSyncConfig) {
    if (!sync.webdavUrl.trim()) {
      throw new Error('WebDAV URL 不能为空');
    }

    const response = await fetchImpl(sync.webdavUrl, {
      method: 'HEAD',
      headers: createAuthHeader(sync.webdavUsername, sync.webdavPassword),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('WebDAV 鉴权失败');
    }
    if (![200, 201, 204, 404, 405].includes(response.status)) {
      throw new Error(`WebDAV 连接失败: ${response.status}`);
    }

    return {
      provider: 'webdav' as const,
      ok: true,
      message: response.status === 404 ? 'WebDAV 可达，目标文件将于首次同步时创建' : 'WebDAV 连接成功',
    };
  },

  /** 读取远端 WebDAV 快照。 */
  async readSnapshot(sync: WebdavSyncConfig) {
    if (!sync.webdavUrl.trim()) {
      throw new Error('WebDAV URL 不能为空');
    }

    const response = await fetchImpl(sync.webdavUrl, {
      method: 'GET',
      headers: createAuthHeader(sync.webdavUsername, sync.webdavPassword),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('WebDAV 鉴权失败');
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`WebDAV 读取失败: ${response.status}`);
    }

    return parseSnapshotPayload(await response.text());
  },

  /** 把当前配置快照写入 WebDAV 目标。 */
  async syncNow(sync: WebdavSyncConfig, snapshot: SyncSnapshot) {
    if (!sync.webdavUrl.trim()) {
      throw new Error('WebDAV URL 不能为空');
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
      throw new Error('WebDAV 鉴权失败');
    }
    if (!response.ok) {
      throw new Error(`WebDAV 同步失败: ${response.status}`);
    }

    return {
      provider: 'webdav' as const,
      snapshotBytes: payload.length,
    };
  },
});
