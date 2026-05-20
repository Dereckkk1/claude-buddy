import ReactDOM from 'react-dom/client';
import App from './App';
import { initI18n } from './i18n';

// Init i18n before first paint so even the initial greeting picks the right
// language. The promise resolves quickly (single IPC call to settings:get).
initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
});
