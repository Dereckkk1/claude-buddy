import React from 'react';
import ReactDOM from 'react-dom/client';
import { SettingsApp } from './SettingsApp';
import { initI18n } from '../src/i18n';
import { initMCPCache } from '../src/services/mcp-tools-cache';

Promise.all([initI18n(), initMCPCache()]).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>
  );
});
