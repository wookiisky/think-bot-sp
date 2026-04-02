import { createRoot } from 'react-dom/client';

import '../../assets/styles/material-symbols.css';

import { SettingsShell } from '../../src/features/settings/settings-shell';

const root = createRoot(document.getElementById('root')!);
root.render(<SettingsShell />);
