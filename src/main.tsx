import ReactDOM from 'react-dom/client';
import App from './App';
import { initI18n } from './i18n';
import { initMCPCache } from './services/mcp-tools-cache';

// Init i18n + MCP tools cache before first paint. i18n decides the language,
// the MCP cache populates so the first chat already sees discovered tools.
Promise.all([initI18n(), initMCPCache()]).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
});
