import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigApp } from './ConfigApp';
import { initI18n } from '../src/i18n';

initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ConfigApp />
    </React.StrictMode>
  );
});
