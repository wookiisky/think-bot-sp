/** 工作台一次性操作反馈。 */
export type WorkspaceToastPayload = {
  /** 反馈语气。 */
  tone: 'success' | 'error';
  /** 反馈正文。 */
  message: string;
};
