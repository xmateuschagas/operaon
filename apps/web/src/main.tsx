import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './style.css';
import { App,ErrorBoundary } from './App.js';

// QueryClient é isolado por navegador; App limpa todos os dados ao trocar a identidade ativa.
const client = new QueryClient();
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><QueryClientProvider client={client}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></ErrorBoundary></StrictMode>);
