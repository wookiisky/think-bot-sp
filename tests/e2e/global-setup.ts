import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Playwright 全局启动钩子，确保 E2E 始终使用当前源码构建出的扩展产物。
 */
export default function globalSetup(): void {
  const projectRoot = path.resolve(__dirname, '../..');

  console.log('[E2E] 开始构建当前源码对应的 Chrome MV3 扩展产物');

  const buildResult = spawnSync('pnpm', ['run', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (buildResult.status !== 0) {
    throw new Error(
      `[E2E] 扩展构建失败，Playwright 已中止。退出码: ${buildResult.status ?? 'unknown'}`
    );
  }

  console.log('[E2E] 扩展构建完成，将加载最新的 .output/chrome-mv3');
}
