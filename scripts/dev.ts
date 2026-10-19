import { spawn } from 'node:child_process';

// O processo pai carrega .env e repassa o ambiente a todos os serviços locais.
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Execute este script por pnpm dev');
const child = spawn(process.execPath, [pnpmCli, '-r', '--parallel', 'dev'], { stdio: 'inherit' });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
