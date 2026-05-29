import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_BLACKLIST_RULES, createDefaultConfig } from '../../../src/domain/config/config-schema';
import { BlacklistSettingsPanel } from '../../../src/features/settings/blacklist-settings-panel';

const t = (key: string) =>
  ({
    'common.cancel': '取消',
    'settings.blacklistSettings': '黑名单设置',
    'settings.blacklistDescription': '管理搜索页等默认阻断规则，并验证单条规则是否命中。',
    'settings.blacklistBuiltIn': '内置',
    'settings.blacklistResetDefaults': '恢复默认规则',
    'settings.noBlacklistRules': '暂无黑名单规则',
    'settings.addBlacklistRule': '新增规则',
    'settings.deleteBlacklistRule': '删除规则',
    'settings.blacklistRuleType': '规则类型',
    'settings.blacklistRuleType.domain': '域名',
    'settings.blacklistRuleType.urlPrefix': 'URL 前缀',
    'settings.blacklistRuleType.regex': '正则表达式',
    'settings.blacklistRulePattern': '匹配模式',
    'settings.blacklistRulePatternEmpty': '未填写匹配模式',
    'settings.blacklistRuleEnabled': '启用规则',
    'settings.blacklistRuleTest': '测试匹配',
    'settings.blacklistRuleTestUrl': '测试 URL',
    'settings.blacklistRuleTestMatched': '当前规则命中该 URL',
    'settings.blacklistRuleTestNotMatched': '当前规则未命中该 URL',
    'settings.blacklistRuleTestInvalid': '当前规则无效，无法完成匹配测试',
    'settings.enabled': '已启用',
    'settings.disabled': '已停用',
  })[key] ?? key;

/** 用受控壳层模拟设置页草稿配置。 */
const ControlledBlacklistSettingsPanel = ({ config: initialConfig }: { config?: ReturnType<typeof createDefaultConfig> }) => {
  const [config, setConfig] = useState(
    initialConfig ??
      createDefaultConfig({
        blacklist: [],
      }),
  );

  return <BlacklistSettingsPanel config={config} disabled={false} onChange={setConfig} t={t} />;
};

describe('BlacklistSettingsPanel', () => {
  afterEach(() => cleanup());

  it('支持新增、编辑、测试与软删除规则', async () => {
    render(
      <ControlledBlacklistSettingsPanel
        config={createDefaultConfig({
          blacklist: [],
        })}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '新增规则' }));
    await user.click(screen.getByRole('combobox', { name: '规则类型' }));
    await user.click(await screen.findByRole('option', { name: '正则表达式' }));
    await user.type(screen.getByLabelText('匹配模式'), '^https://www\\.google\\.com/search');
    await user.type(screen.getByLabelText('测试 URL'), 'https://www.google.com/search?q=ai');
    await user.click(screen.getByRole('button', { name: '测试匹配' }));

    expect(screen.getByText('当前规则命中该 URL')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除规则' }));
    await user.click(within(screen.getByTestId('blacklist-delete-confirm')).getByRole('button', { name: '删除规则' }));
    expect(screen.getByText('暂无黑名单规则')).toBeInTheDocument();
  });

  it('恢复默认规则时保留自定义规则并重建内置规则', async () => {
    const firstBuiltInRule = DEFAULT_BLACKLIST_RULES[0];
    if (!firstBuiltInRule) {
      throw new Error('missing built-in blacklist rule');
    }

    render(
      <ControlledBlacklistSettingsPanel
        config={createDefaultConfig({
          blacklist: [
            {
              id: 'custom-rule',
              type: 'domain',
              pattern: 'example.com',
              enabled: true,
              deletedAt: null,
            },
            {
              ...firstBuiltInRule,
              enabled: false,
              deletedAt: 10,
            },
          ],
        })}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '恢复默认规则' }));

    expect(screen.getByRole('button', { name: /example\.com/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /google/ })).toBeInTheDocument();
    expect(screen.getAllByText('内置').length).toBeGreaterThan(0);
  });
});
