import { describe, expect, it, vi } from 'vitest';

import { openOptionsPage } from '../../../../src/services/navigation/options-page';

describe('openOptionsPage', () => {
  it('统一通过 runtime.openOptionsPage 打开设置页', async () => {
    const openOptionsPageMock = vi.fn().mockResolvedValue(undefined);
    const logger = {
      info: vi.fn(),
    };

    await openOptionsPage({
      runtime: {
        openOptionsPage: openOptionsPageMock,
      },
      logger,
    });

    expect(openOptionsPageMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('settings.open.requested', {
      page: 'options.html',
    });
  });
});
