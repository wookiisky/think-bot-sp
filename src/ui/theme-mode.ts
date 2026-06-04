import { useEffect, useLayoutEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ResolvedThemeMode = 'light' | 'dark';

export type ThemeRootAttributes = {
  /** 用户配置中的主题偏好。 */
  dataTheme: ThemePreference;
  /** 浏览器设置解析后的实际主题。 */
  dataResolvedTheme: ResolvedThemeMode;
};

const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** 根据浏览器 prefers-color-scheme 读取当前系统主题。 */
const readBrowserThemeMode = (): ResolvedThemeMode => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches ? 'dark' : 'light';
};

/** 将用户主题偏好解析为当前实际主题。 */
export const resolveThemeMode = (theme: ThemePreference): ResolvedThemeMode => {
  if (theme === 'dark') {
    return 'dark';
  }
  if (theme === 'light') {
    return 'light';
  }

  return readBrowserThemeMode();
};

/** 构建页面根节点主题属性。 */
export const getThemeRootAttributes = (theme: ThemePreference, resolvedThemeMode: ResolvedThemeMode): ThemeRootAttributes => ({
  dataTheme: theme,
  dataResolvedTheme: resolvedThemeMode,
});

/** 将解析后的主题同步到 documentElement，确保 body 和 portal 都吃到同一套 token。 */
const applyDocumentTheme = (theme: ThemePreference, resolvedThemeMode: ResolvedThemeMode) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.resolvedTheme = resolvedThemeMode;
  root.classList.toggle('dark', resolvedThemeMode === 'dark');
};

/** 跟随配置和浏览器深浅色设置，返回当前实际主题。 */
export const useResolvedThemeMode = (theme: ThemePreference): ResolvedThemeMode => {
  const [resolvedThemeMode, setResolvedThemeMode] = useState<ResolvedThemeMode>(() => resolveThemeMode(theme));

  useEffect(() => {
    if (theme !== 'system') {
      setResolvedThemeMode(resolveThemeMode(theme));
      return;
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setResolvedThemeMode('light');
      return;
    }

    const mediaQuery = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
    const syncBrowserTheme = () => {
      setResolvedThemeMode(mediaQuery.matches ? 'dark' : 'light');
    };

    syncBrowserTheme();
    mediaQuery.addEventListener('change', syncBrowserTheme);
    return () => {
      mediaQuery.removeEventListener('change', syncBrowserTheme);
    };
  }, [theme]);

  return resolvedThemeMode;
};

/** 将页面主题作用域提升到 html，并返回页面根节点可展示的主题属性。 */
export const useDocumentTheme = (theme: ThemePreference): ThemeRootAttributes => {
  const resolvedThemeMode = useResolvedThemeMode(theme);

  useLayoutEffect(() => {
    applyDocumentTheme(theme, resolvedThemeMode);

    return () => {
      if (typeof document === 'undefined') {
        return;
      }

      const root = document.documentElement;
      root.classList.remove('dark');
      root.removeAttribute('data-theme');
      root.removeAttribute('data-resolved-theme');
    };
  }, [resolvedThemeMode, theme]);

  return getThemeRootAttributes(theme, resolvedThemeMode);
};
