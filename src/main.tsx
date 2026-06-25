import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ maxWidth: 480, margin: '48px auto', padding: 'var(--space-16)' }}>
      <App />
    </div>
  </React.StrictMode>
);
