type DownloadPayload = {
  /** 下载文件名。 */
  filename: string;
  /** 文本内容。 */
  content: string;
  /** MIME 类型。 */
  mimeType: string;
};

/** 把文本内容下载为本地文件。 */
export const downloadTextFile = (input: DownloadPayload) => {
  const blob = new Blob([input.content], { type: input.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = input.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);

  return input.filename;
};
