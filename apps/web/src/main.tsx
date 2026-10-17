import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import './style.css';

// Página inicial mínima; fluxos completos serão entregues nas sessões 7a e 7b.
const client = new QueryClient();
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><main><h1>OperaON</h1><p>Fundação do CRM pronta.</p></main></BrowserRouter></QueryClientProvider></StrictMode>);
