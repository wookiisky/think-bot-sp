import { createRoot } from 'react-dom/client';

import '../../assets/styles/globals.css';

import { createConversationsApi } from '../../src/features/conversations/conversations-api';
import { ConversationsShell } from '../../src/features/conversations/conversations-shell';

const root = createRoot(document.getElementById('root')!);
root.render(<ConversationsShell api={createConversationsApi()} />);
