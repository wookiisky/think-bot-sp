import { useState } from 'react';
import {
  DEFAULT_ASSISTANT_BRANCH_COLUMN_WIDTH,
  DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
  type AssistantMarkdownDisplayConfig,
} from '../../domain/config/assistant-markdown-display-config';
import {
  DEFAULT_EXTRACTION_PANEL_HEIGHT,
  DEFAULT_EXTRACTION_TEXT_FONT_SIZE,
  MAX_EXTRACTION_PANEL_HEIGHT,
  MIN_EXTRACTION_PANEL_HEIGHT,
  type ExtensionConfig,
  type ExtractionTextFontSize,
} from '../../domain/config/config-schema';
import { getExtractionTextClassName } from '../../lib/extraction-text-font-size';
import { type ThemePreference, useDocumentTheme } from '../../ui/theme-mode';
import { useDragResize } from './use-drag-resize';

/** 限制提取区高度范围。 */
export const clampExtractionPanelHeight = (height: number) =>
  Math.min(MAX_EXTRACTION_PANEL_HEIGHT, Math.max(MIN_EXTRACTION_PANEL_HEIGHT, height));

/**
 * 侧边栏与历史页共用的展示配置：主题、提取区高度与字号、助手 Markdown 展示、分支列宽。
 * 这些值都来自配置，`applyConfig` 在配置加载后一次性写入。
 */
export const useWorkspaceDisplayConfig = () => {
  const [extractionTextFontSize, setExtractionTextFontSize] = useState<ExtractionTextFontSize>(DEFAULT_EXTRACTION_TEXT_FONT_SIZE);
  const [assistantMarkdownDisplayConfig, setAssistantMarkdownDisplayConfig] = useState<AssistantMarkdownDisplayConfig>(
    DEFAULT_ASSISTANT_MARKDOWN_DISPLAY_CONFIG,
  );
  const [assistantBranchColumnWidth, setAssistantBranchColumnWidth] = useState(DEFAULT_ASSISTANT_BRANCH_COLUMN_WIDTH);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const themeRootAttributes = useDocumentTheme(themePreference);
  const extractionPanel = useDragResize({ axis: 'y', initialSize: DEFAULT_EXTRACTION_PANEL_HEIGHT, clamp: clampExtractionPanelHeight });

  /** 用最新配置刷新全部展示项。 */
  const applyConfig = (config: ExtensionConfig) => {
    extractionPanel.setSize(config.basic.extractionPanelHeight);
    setExtractionTextFontSize(config.basic.extractionTextFontSize);
    setAssistantMarkdownDisplayConfig(config.display.assistantMarkdown);
    setAssistantBranchColumnWidth(config.display.assistantBranchColumnWidth);
    setThemePreference(config.basic.theme);
  };

  return {
    themeRootAttributes,
    assistantMarkdownDisplayConfig,
    assistantBranchColumnWidth,
    extractionTextClassName: getExtractionTextClassName(extractionTextFontSize),
    extractionPanel: {
      height: extractionPanel.size,
      isCollapsed: extractionPanel.size <= MIN_EXTRACTION_PANEL_HEIGHT,
      startDrag: extractionPanel.startDrag,
    },
    applyConfig,
  };
};
