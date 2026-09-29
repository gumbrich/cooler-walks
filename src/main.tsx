import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import App from './App';
import { I18nProvider } from './i18n';
import './styles.css';
import { isNativeApp } from './lib/platform';
if (isNativeApp) document.documentElement.classList.add('native-app');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
if (!isNativeApp && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Website remains usable when caching is unavailable. */
    }),
  );
}
