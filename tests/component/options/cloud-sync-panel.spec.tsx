import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultConfig } from '../../../src/domain/config/config-schema';
import { CloudSyncPanel } from '../../../src/features/settings/cloud-sync-panel';

const t = (key: string) =>
  ({
    'settings.syncPanel': '云同步',
    'settings.syncDescription': '说明',
    'settings.syncEnabled': '启用同步',
    'settings.syncProvider': '同步提供方',
    'settings.syncTest': '测试连接',
    'settings.syncNow': '立即同步',
    'settings.syncLastSyncedAt': '最近同步时间',
    'settings.syncNever': '从未同步',
    'settings.syncProviderNone': '不启用',
    'settings.syncProviderGist': 'Gist',
    'settings.syncProviderWebdav': 'WebDAV',
    'settings.gistToken': 'Gist Token',
    'settings.gistId': 'Gist ID',
    'settings.webdavUrl': 'WebDAV URL',
    'settings.webdavUsername': 'WebDAV 用户名',
    'settings.webdavPassword': 'WebDAV 密码',
  })[key] ?? key;

/** 受控测试壳层，模拟设置页对草稿配置的更新。 */
const ControlledCloudSyncPanel = ({
  onTestConnection,
  onSyncNow,
}: {
  /** 测试连接回调。 */
  onTestConnection: () => Promise<void>;
  /** 立即同步回调。 */
  onSyncNow: () => Promise<void>;
}) => {
  const [config, setConfig] = useState(createDefaultConfig());

  return (
    <CloudSyncPanel
      config={config}
      disabled={false}
      testing={false}
      syncing={false}
      feedback={null}
      onChange={setConfig}
      onTestConnection={onTestConnection}
      onSyncNow={onSyncNow}
      t={t}
    />
  );
};

describe('CloudSyncPanel', () => {
  afterEach(() => cleanup());

  it('切换 provider 后展示对应字段并触发连接测试', async () => {
    const onTestConnection = vi.fn().mockResolvedValue(undefined);
    const onSyncNow = vi.fn().mockResolvedValue(undefined);

    render(<ControlledCloudSyncPanel onTestConnection={onTestConnection} onSyncNow={onSyncNow} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: '启用同步' }));
    await user.click(screen.getByRole('combobox', { name: '同步提供方' }));
    await user.click(await screen.findByRole('option', { name: 'Gist' }));

    expect(screen.getByLabelText('Gist Token')).toBeInTheDocument();
    expect(screen.getByLabelText('Gist ID')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '测试连接' }));
    expect(onTestConnection).toHaveBeenCalledTimes(1);
  });

  it('展示最近同步结果和同步按钮', () => {
    render(
      <CloudSyncPanel
        config={createDefaultConfig({
          sync: {
            enabled: true,
            provider: 'gist',
            gistToken: 'token',
            gistId: 'gist-id',
            webdavUrl: '',
            webdavUsername: '',
            webdavPassword: '',
            lastSyncAt: 123456,
          },
        })}
        disabled={false}
        testing={false}
        syncing={false}
        feedback={{ tone: 'success', message: '同步成功' }}
        onChange={vi.fn()}
        onTestConnection={vi.fn()}
        onSyncNow={vi.fn()}
        t={t}
      />,
    );

    expect(screen.getByText('同步成功')).toBeInTheDocument();
    expect(screen.getByText(/123456/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '立即同步' })).toBeInTheDocument();
  });
});
