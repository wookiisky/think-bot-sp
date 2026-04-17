import '../../assets/styles/globals.css';

import { createConversationsApi } from '../../src/features/conversations/conversations-api';
import { ConversationsShell } from '../../src/features/conversations/conversations-shell';
import { renderEntrypointApp } from '../../src/shared/react-entrypoint-root';

renderEntrypointApp(<ConversationsShell api={createConversationsApi()} />);
