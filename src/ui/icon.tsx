import '../../assets/styles/material-symbols.css';

type IconName = 'settings' | 'language' | 'save' | 'cache' | 'menu' | 'chevron-right';

type IconProps = {
  /** 图标名称。 */
  name: IconName;
  /** 可选无障碍名称。 */
  label?: string;
  /** 图标尺寸。 */
  size?: number;
  /** 外层 class。 */
  className?: string;
};

const iconPaths: Record<IconName, string> = {
  settings: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.89 1h-3.78a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.13.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.72 7.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.84 13.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.33.64.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.04.24.24.42.49.42h3.78c.25 0 .45-.18.49-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z',
  language: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1.5 2.2c1.78.55 3.22 2.74 3.53 5.3h-2.7c-.1-2.04-.45-3.84-.83-5.3ZM12 5.1c.47 0 1.11 1.46 1.39 5.4h-2.78c.28-3.94.92-5.4 1.39-5.4Zm-1.84.1c-.38 1.46-.73 3.26-.83 5.3h-2.7c.31-2.56 1.75-4.75 3.53-5.3ZM6.63 12h2.72c.1 2.04.45 3.84.83 5.3-1.78-.55-3.22-2.74-3.55-5.3Zm5.37 6.9c-.47 0-1.11-1.46-1.39-5.4h2.78c-.28 3.94-.92 5.4-1.39 5.4Zm1.84-.1c.38-1.46.73-3.26.83-5.3h2.72c-.33 2.56-1.77 4.75-3.55 5.3Zm-.83-6.9H10.2c.09-1.92.4-3.62.73-5h2.14c.33 1.38.64 3.08.73 5Zm-4.53 0H5.15a7.12 7.12 0 0 1 0-5h2.97c-.13 1.56-.13 3.44 0 5Zm8.78 0a7.12 7.12 0 0 1 0-5h2.97a7.12 7.12 0 0 1 0 5h-2.97Z',
  save: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-5 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm1-11H6V5h7v3Z',
  cache: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 4h-2v5.17l3.59 2.59 1.18-1.63L13 11.2V7Zm-1 11a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z',
  menu: 'M4 7h16v2H4V7Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z',
  'chevron-right': 'M9.29 6.71a1 1 0 0 0 0 1.41L12.17 11l-2.88 2.88a1 1 0 1 0 1.41 1.41l3.59-3.59a1 1 0 0 0 0-1.41L10.7 6.71a1 1 0 0 0-1.41 0Z',
};

/** 本地图标，避免依赖在线字体。 */
export const Icon = ({
  name,
  label,
  size = 18,
  className = '',
}: IconProps) => {
  const path = iconPaths[name];
  const ariaProps = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  return (
    <span className={['material-symbols-icon', className].filter(Boolean).join(' ')} {...ariaProps}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        focusable="false"
      >
        {label ? <title>{label}</title> : null}
        <path d={path} />
      </svg>
    </span>
  );
};
