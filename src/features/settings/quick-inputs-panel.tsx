import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

type QuickInputPreview = {
  /** 快捷输入 id。 */
  id: string;
  /** 快捷输入名称。 */
  name: string;
  /** 快捷输入提示词预览。 */
  prompt: string;
};

type QuickInputsPanelProps = {
  /** 快捷输入列表。 */
  quickInputs: QuickInputPreview[];
};

/** 快捷输入最小折叠预览区。 */
export const QuickInputsPanel = ({ quickInputs }: QuickInputsPanelProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card aria-label="快捷输入预览" className="rounded-3xl bg-card/90 shadow-xl ring-1 ring-foreground/8">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <CardTitle className="text-base">快捷输入</CardTitle>
        <Button type="button" variant="outline" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '展开预览' : '收起预览'}
        </Button>
      </CardHeader>

      {!collapsed ? (
        <CardContent className="px-5 py-5">
          <ul className="grid gap-3">
            {quickInputs.length > 0 ? (
              quickInputs.map((item) => (
                <li key={item.id} className="rounded-2xl border border-border/70 bg-muted/50 px-4 py-3">
                  <strong className="mb-1 block">{item.name}</strong>
                  <p className="text-sm leading-6 text-muted-foreground">{item.prompt}</p>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">暂无快捷输入预览</li>
            )}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
};
