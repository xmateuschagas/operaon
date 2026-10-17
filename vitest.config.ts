import { defineConfig } from 'vitest/config';

// Banco isolado por suíte; arquivos rodam em série para testar migrations reais.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 } });
