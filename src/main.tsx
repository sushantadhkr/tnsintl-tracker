import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installDemo } from './demo';
import './styles.css';

installDemo();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
