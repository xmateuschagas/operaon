import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './style.css';
import { Identity } from './Identity.js';

// Página inicial mínima; fluxos completos serão entregues nas sessões 7a e 7b.
const client = new QueryClient();
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><main><Identity/></main></BrowserRouter></QueryClientProvider></StrictMode>);
