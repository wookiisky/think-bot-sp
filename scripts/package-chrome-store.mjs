// @ts-check

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * @typedef {{ status: number | null, error?: Error }} CommandResult
 * @typedef {(command: string, args: string[], options: { cwd: string, stdio: 'inherit' }) => CommandResult} CommandRunner
 * @typedef {(filePath: string, encoding: BufferEncoding) => string} ReadTextFile
 * @typedef {(filePath: string, content: string, encoding: BufferEncoding) => void} WriteTextFile
 * @typedef {{
 *   cwd?: string;
 *   packageJsonPath?: string;
 *   runCommand?: CommandRunner;
 *   readFile?: ReadTextFile;
 *   writeFile?: WriteTextFile;
 * }} PackageChromeStoreOptions
 * @typedef {{ previousVersion: string, nextVersion: string }} PackageChromeStoreResult
 */

/** 根据 Chrome 商店发布规则递增版本号。 */
export const getNextStoreVersion = (version) => {
  if (typeof version !== 'string') {
    throw new Error('package.json version must be a string');
  }

  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(`package.json version must use numeric x.y.z format: ${version}`);
  }

  const majorText = match[1];
  const minorText = match[2];
  if (!majorText || !minorText) {
    throw new Error(`package.json version must use numeric x.y.z format: ${version}`);
  }

  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText, 10);

  return `${major}.${minor + 1}.0`;
};

/** 解析 package.json，并在进入核心流程前校验必要字段。 */
const parsePackageJson = (packageJsonText) => {
  /** @type {unknown} */
  const parsed = JSON.parse(packageJsonText);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('package.json must contain an object');
  }

  if (!('version' in parsed) || typeof parsed.version !== 'string') {
    throw new Error('package.json must contain a string version');
  }

  return parsed;
};

/** 获取当前平台可执行的本地 WXT 命令路径。 */
const resolveLocalWxtCommand = (cwd) => {
  const executable = process.platform === 'win32' ? 'wxt.cmd' : 'wxt';

  return path.join(cwd, 'node_modules', '.bin', executable);
};

/** 执行命令并返回进程结果，便于单测替换。 */
const runLocalCommand = (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.stdio,
  });

  return {
    status: result.status,
    error: result.error,
  };
};

/** 将 WXT 失败和回滚失败合并成一个可读错误。 */
const buildRollbackFailureError = (wxtError, rollbackError) => {
  return new Error(
    [
      `Chrome store zip failed: ${wxtError.message}`,
      `Rollback package.json failed: ${rollbackError.message}`,
      'Please inspect package.json before retrying.',
    ].join('\n'),
  );
};

/** 恢复原始 package.json；若恢复失败，保留两个错误上下文。 */
const rollbackPackageJsonAndThrow = (packageJsonPath, originalPackageJsonText, writeFile, wxtError) => {
  try {
    writeFile(packageJsonPath, originalPackageJsonText, 'utf8');
  } catch (rollbackError) {
    throw buildRollbackFailureError(wxtError, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
  }

  throw wxtError;
};

/** 调用 WXT 生成 Chrome 商店 zip，并确保失败时不消费版本号。 */
export const packageChromeStore = (options = {}) => {
  const cwd = options.cwd ?? process.cwd();
  const packageJsonPath = options.packageJsonPath ?? path.join(cwd, 'package.json');
  const readFile = options.readFile ?? fs.readFileSync;
  const writeFile = options.writeFile ?? fs.writeFileSync;
  const runCommand = options.runCommand ?? runLocalCommand;

  const originalPackageJsonText = readFile(packageJsonPath, 'utf8');
  const packageJson = parsePackageJson(originalPackageJsonText);
  const previousVersion = packageJson.version;
  const nextVersion = getNextStoreVersion(previousVersion);
  const nextPackageJsonText = `${JSON.stringify(
    {
      ...packageJson,
      version: nextVersion,
    },
    null,
    2,
  )}\n`;

  writeFile(packageJsonPath, nextPackageJsonText, 'utf8');

  const wxtCommand = resolveLocalWxtCommand(cwd);
  let wxtResult;
  try {
    wxtResult = runCommand(wxtCommand, ['zip', '-b', 'chrome'], {
      cwd,
      stdio: 'inherit',
    });
  } catch (error) {
    rollbackPackageJsonAndThrow(
      packageJsonPath,
      originalPackageJsonText,
      writeFile,
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  const wxtError =
    wxtResult.error ??
    (wxtResult.status === 0 ? undefined : new Error(`wxt zip exited with status ${wxtResult.status ?? 'unknown'}`));

  if (wxtError) {
    rollbackPackageJsonAndThrow(packageJsonPath, originalPackageJsonText, writeFile, wxtError);
  }

  return {
    previousVersion,
    nextVersion,
  };
};

const isCliEntry = () => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return import.meta.url === pathToFileURL(path.resolve(entryPath)).href;
};

if (isCliEntry()) {
  try {
    const result = packageChromeStore();
    console.log(`Chrome store zip created. Version: ${result.previousVersion} -> ${result.nextVersion}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
