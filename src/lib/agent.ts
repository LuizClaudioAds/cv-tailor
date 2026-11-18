import { spawn } from 'node:child_process';

export interface AgentRunOptions {
  promptPath: string;
  message: string;
  cwd: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Executa o OpenCode em modo headless com o agente cv-tailor.
 * O agente escreve os arquivos direto na pasta da vaga; aqui so acompanhamos o processo.
 */
export async function runCvAgent(options: AgentRunOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const args = [
    'run',
    '--agent',
    'cv-tailor',
    '--archived',
    '--auto',
    '--file',
    options.promptPath,
    options.message,
  ];
  if (options.model) args.push('--model', options.model);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('opencode', args, {
      cwd: options.cwd,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(`O agente excedeu ${Math.round(timeoutMs / 60000)} minutos e foi encerrado.`),
      );
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Nao foi possivel executar "opencode": ${error.message}`));
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`O agente terminou com codigo ${code}. Veja a saida acima.`));
    });
  });
}
