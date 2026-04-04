import type { ExtensionConfig } from '../../domain/config/config-schema';

type SyncSnapshot = {
  /** 当前快照 schema 版本。 */
  schemaVersion: string;
  /** 快照生成时间。 */
  exportedAt: number;
  /** 当前最小闭环只同步配置。 */
  config: ExtensionConfig;
};

type GistSyncConfig = ExtensionConfig['sync'];

const GIST_FILENAME = 'think-bot-sp-sync.json';

const createAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
});

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
