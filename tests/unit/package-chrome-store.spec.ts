import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getNextStoreVersion, packageChromeStore } from '../../scripts/package-chrome-store.mjs';

type CommandCall = {
  command: string;
  args: string[];
  cwd: string;
  stdio: 'inherit';
};

const temporaryDirectories: string[] = [];

/** 创建隔离的临时项目目录。 */
const createTemporaryProject = (packageJson: object) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'think-bot-package-'));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  return directory;
};

/** 读取临时项目的 package.json 文本。 */
const readPackageJsonText = (directory: string) => {
  return fs.readFileSync(path.join(directory, 'package.json'), 'utf8');
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('getNextStoreVersion', () => {
  it('按 minor +1 递增发布版本并归零 patch', () => {
    expect(getNextStoreVersion('0.1.0')).toBe('0.2.0');
    expect(getNextStoreVersion('1.9.3')).toBe('1.10.0');
  });

  it('拒绝 Chrome manifest 不接受的非三段数字版本', () => {
    expect(() => getNextStoreVersion('1.0')).toThrow(/x\.y\.z/);
    expect(() => getNextStoreVersion('1.0.0-beta.1')).toThrow(/x\.y\.z/);
  });
});

describe('packageChromeStore', () => {
  it('成功路径写入新版本并调用本地 WXT Chrome zip', () => {
    const directory = createTemporaryProject({
      name: 'extension',
      version: '0.1.0',
      private: true,
    });
    const calls: CommandCall[] = [];

    const result = packageChromeStore({
      cwd: directory,
      runCommand: (command, args, options) => {
        calls.push({
          command,
          args,
          cwd: options.cwd,
          stdio: options.stdio,
        });

        return { status: 0 };
      },
    });

    expect(result).toEqual({
      previousVersion: '0.1.0',
      nextVersion: '0.2.0',
    });
    expect(JSON.parse(readPackageJsonText(directory))).toMatchObject({
      version: '0.2.0',
    });
    expect(calls).toEqual([
      {
        command: path.join(directory, 'node_modules', '.bin', process.platform === 'win32' ? 'wxt.cmd' : 'wxt'),
        args: ['zip', '-b', 'chrome'],
        cwd: directory,
        stdio: 'inherit',
      },
    ]);
  });

  it('非法版本不写文件也不调用 WXT', () => {
    const directory = createTemporaryProject({
      name: 'extension',
      version: '0.1.0-beta.1',
    });
    const originalPackageJsonText = readPackageJsonText(directory);
    const calls: CommandCall[] = [];

    expect(() =>
      packageChromeStore({
        cwd: directory,
        runCommand: (command, args, options) => {
          calls.push({
            command,
            args,
            cwd: options.cwd,
            stdio: options.stdio,
          });

          return { status: 0 };
        },
      }),
    ).toThrow(/x\.y\.z/);

    expect(readPackageJsonText(directory)).toBe(originalPackageJsonText);
    expect(calls).toHaveLength(0);
  });

  it('缺少 version 时不写文件也不调用 WXT', () => {
    const directory = createTemporaryProject({
      name: 'extension',
    });
    const originalPackageJsonText = readPackageJsonText(directory);
    const calls: CommandCall[] = [];

    expect(() =>
      packageChromeStore({
        cwd: directory,
        runCommand: (command, args, options) => {
          calls.push({
            command,
            args,
            cwd: options.cwd,
            stdio: options.stdio,
          });

          return { status: 0 };
        },
      }),
    ).toThrow(/string version/);

    expect(readPackageJsonText(directory)).toBe(originalPackageJsonText);
    expect(calls).toHaveLength(0);
  });

  it('WXT 返回非 0 时恢复原始 package.json', () => {
    const directory = createTemporaryProject({
      name: 'extension',
      version: '0.1.0',
      private: true,
    });
    const originalPackageJsonText = readPackageJsonText(directory);

    expect(() =>
      packageChromeStore({
        cwd: directory,
        runCommand: () => ({ status: 1 }),
      }),
    ).toThrow(/status 1/);

    expect(readPackageJsonText(directory)).toBe(originalPackageJsonText);
  });

  it('WXT 命令执行异常时恢复原始 package.json', () => {
    const directory = createTemporaryProject({
      name: 'extension',
      version: '0.1.0',
      private: true,
    });
    const originalPackageJsonText = readPackageJsonText(directory);

    expect(() =>
      packageChromeStore({
        cwd: directory,
        runCommand: () => {
          throw new Error('spawn failed');
        },
      }),
    ).toThrow(/spawn failed/);

    expect(readPackageJsonText(directory)).toBe(originalPackageJsonText);
  });

  it('回滚失败时同时暴露打包失败和回滚失败原因', () => {
    const directory = createTemporaryProject({
      name: 'extension',
      version: '0.1.0',
      private: true,
    });
    const packageJsonPath = path.join(directory, 'package.json');
    let writeCount = 0;

    expect(() =>
      packageChromeStore({
        cwd: directory,
        packageJsonPath,
        writeFile: (filePath, content, encoding) => {
          writeCount += 1;
          if (writeCount === 2) {
            throw new Error('disk readonly');
          }

          fs.writeFileSync(filePath, content, encoding);
        },
        runCommand: () => ({ status: 1 }),
      }),
    ).toThrow(/Rollback package\.json failed: disk readonly/);

    expect(JSON.parse(readPackageJsonText(directory))).toMatchObject({
      version: '0.2.0',
    });
  });
});
