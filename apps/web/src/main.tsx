import './mantineSheetsInLoadOrder.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const ROOT_ELEMENT_ID = 'root';
const INDEX_WITHOUT_ROOT = 'index.html sem #root';

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (rootElement === null) throw new Error(INDEX_WITHOUT_ROOT);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
