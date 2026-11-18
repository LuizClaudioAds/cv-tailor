import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tailor } from './tailor.js';

interface Entry {
  hash: string;
  file: string;
  status: 'ok' | 'failed';
  slug?: string;
  at: string;
}

export interface InboxOptions {
  dir?: string;
  lang?: 'pt' | 'en';
  model?: string;
  cover?: boolean;
  limit?: number;
  retryFailed?: boolean;
}

const SUPPORTED = /\.(md|txt)$/i;

export async function inbox(options: InboxOptions = {}): Promise<void> {
  const dir = path.resolve(process.cwd(), options.dir ?? 'vagas');
  const files = await fs.readdir(dir).catch(() => {
    throw new Error(
      `Pasta "${options.dir ?? 'vagas'}" nao encontrada. Crie a pasta e coloque as vagas em .md ou .txt.`,
    );
  });

  const storePath = path.join(dir, '.processadas.json');
  const entries = await readStore(storePath);
  const done = new Map(entries.map((entry) => [entry.hash, entry]));

  const queue = files
    .filter((file) => SUPPORTED.test(file))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(dir, file));

  if (queue.length === 0) {
    console.log(`Nenhuma vaga em ${path.relative(process.cwd(), dir)} (.md ou .txt).`);
    return;
  }

  const pending: string[] = [];
  for (const file of queue) {
    const hash = await hashFile(file);
    const previous = done.get(hash);
    if (previous && (previous.status === 'ok' || !options.retryFailed)) {
      if (previous.status === 'failed') {
        console.log(
          `- ${path.basename(file)}: falhou antes. Use --retry-failed para tentar de novo.`,
        );
      }
      continue;
    }
    pending.push(file);
  }

  const limited = options.limit ? pending.slice(0, options.limit) : pending;
  if (limited.length === 0) {
    console.log(`Nada novo para processar (${done.size} ja processada(s)).`);
    return;
  }

  console.log(`${limited.length} vaga(s) na fila de ${path.relative(process.cwd(), dir)}.\n`);

  let ok = 0;
  let failed = 0;

  for (const [index, file] of limited.entries()) {
    const label = `[${index + 1}/${limited.length}] ${path.basename(file)}`;
    console.log(`\n=== ${label} ===`);
    const hash = await hashFile(file);
    try {
      const result = await tailor(file, {
        lang: options.lang,
        model: options.model,
        cover: options.cover,
      });
      ok += 1;
      done.set(hash, {
        hash,
        file: path.basename(file),
        status: 'ok',
        slug: result.slug,
        at: new Date().toISOString(),
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`falhou: ${message.split('\n')[0]}`);
      done.set(hash, {
        hash,
        file: path.basename(file),
        status: 'failed',
        at: new Date().toISOString(),
      });
    }
    await writeStore(storePath, [...done.values()]);
  }

  console.log(
    `\nResumo: ${ok} gerada(s), ${failed} com problema, ${limited.length} processada(s).`,
  );
  if (failed > 0) {
    console.log('Corrija com "cvtailor fix <slug>" ou rode de novo com --retry-failed.');
    process.exitCode = 1;
  }
}

async function hashFile(file: string): Promise<string> {
  const content = await fs.readFile(file);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function readStore(file: string): Promise<Entry[]> {
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

async function writeStore(file: string, entries: Entry[]): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}
