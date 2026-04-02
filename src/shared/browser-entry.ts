const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
];

export const isRestrictedUrl = (rawUrl: string): boolean => {
  const normalized = rawUrl.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return RESTRICTED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export const resolveWelcomeLocale = (uiLocale: string): 'zh-CN' | 'en' => {
  if (!uiLocale) {
    return 'en';
  }

  const normalized = uiLocale.trim().toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'en';
};
