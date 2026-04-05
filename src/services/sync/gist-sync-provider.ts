import type { ExtensionConfig } from '../../domain/config/config-schema';
import { syncSnapshotSchema } from '../../domain/sync/sync-snapshot-schema';
import type { SyncSnapshot } from '../../domain/sync/sync-snapshot-schema';

type GistSyncConfig = ExtensionConfig['sync'];

const GIST_FILENAME = 'think-bot-sp-sync.json';

const createAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
});

/** 解析远端 gist 文件内容。 */
const parseSnapshotPayload = (payload: string) => {
  if (!payload.trim()) {
    return null;
  }

  try {
    return syncSnapshotSchema.parse(JSON.parse(payload));
  } catch {
    throw new Error('Gist 远端快照格式非法');
  }
};

/** GitHub Gist 同步 provider。 */
export const createGistSyncProvider = (fetchImpl: typeof fetch) => ({
  /** 测试 Gist 连接。 */
  async testConnection(sync: GistSyncConfig) {
    if (!sync.gistToken.trim() || !sync.gistId.trim()) {
      throw new Error('Gist Token 和 Gist ID 不能为空');
    }

    const response = await fetchImpl(`https://api.github.com/gists/${sync.gistId}`, {
      method: 'GET',
      headers: createAuthHeaders(sync.gistToken),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Gist 鉴权失败');
    }
    if (!response.ok) {
      throw new Error(`Gist 连接失败: ${response.status}`);
    }

    return {
      provider: 'gist' as const,
      ok: true,
      message: 'Gist 连接成功',
    };
  },

  /** 读取远端 Gist 快照。 */
  async readSnapshot(sync: GistSyncConfig) {
    if (!sync.gistToken.trim() || !sync.gistId.trim()) {
      throw new Error('Gist Token 和 Gist ID 不能为空');
    }

    const response = await fetchImpl(`https://api.github.com/gists/${sync.gistId}`, {
      method: 'GET',
      headers: createAuthHeaders(sync.gistToken),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Gist 鉴权失败');
    }
    if (!response.ok) {
      throw new Error(`Gist 读取失败: ${response.status}`);
    }

    const payload = (await response.json()) as {
      files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string | null }>;
    };
    const file = payload.files?.[GIST_FILENAME];
    if (!file) {
      return null;
    }

    if (typeof file.content === 'string' && !file.truncated) {
      return parseSnapshotPayload(file.content);
    }

    if (typeof file.raw_url === 'string' && file.raw_url) {
      const rawResponse = await fetchImpl(file.raw_url, {
        method: 'GET',
        headers: createAuthHeaders(sync.gistToken),
      });
      if (rawResponse.status === 401 || rawResponse.status === 403) {
        throw new Error('Gist 鉴权失败');
      }
      if (!rawResponse.ok) {
        throw new Error(`Gist 读取失败: ${rawResponse.status}`);
      }
      return parseSnapshotPayload(await rawResponse.text());
    }

    return null;
  },

  /** 把当前配置快照推送到 Gist。 */
  async syncNow(sync: GistSyncConfig, snapshot: SyncSnapshot) {
    if (!sync.gistToken.trim() || !sync.gistId.trim()) {
      throw new Error('Gist Token 和 Gist ID 不能为空');
    }

    const body = JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(snapshot, null, 2),
        },
      },
    });

    const response = await fetchImpl(`https://api.github.com/gists/${sync.gistId}`, {
      method: 'PATCH',
      headers: createAuthHeaders(sync.gistToken),
      body,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Gist 鉴权失败');
    }
    if (!response.ok) {
      throw new Error(`Gist 同步失败: ${response.status}`);
    }

    return {
      provider: 'gist' as const,
      snapshotBytes: body.length,
    };
  },
});
