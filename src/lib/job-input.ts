import fs from 'node:fs/promises';
import path from 'node:path';

export interface JobSource {
  text: string;
  origin: string;
}

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Converte HTML de vaga em texto legivel, preservando quebras de paragrafo. */
export function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(text)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => named[entity.toLowerCase()] ?? entity);
}

export async function fetchJobFromUrl(url: string): Promise<JobSource> {
  let response: Response;
  try {
    response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  } catch (error) {
    throw new Error(
      `Nao consegui acessar ${url}: ${error instanceof Error ? error.message : String(error)}\n` +
        'LinkedIn e alguns portais bloqueiam leitura automatica. Copie o texto da vaga e salve em um ' +
        'arquivo .md/.txt, depois rode: cvtailor tailor <arquivo>.',
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `O site respondeu ${response.status} para ${url}. ` +
        'Copie o texto da vaga para um arquivo e informe o caminho.',
    );
  }

  const html = await response.text();
  const text = htmlToText(html);

  if (text.length < 400) {
    throw new Error(
      `A pagina retornou pouco texto (${text.length} caracteres), provavelmente bloqueio ou conteudo dinamico. ` +
        'Copie a descricao da vaga em um arquivo e rode: cvtailor tailor <arquivo>.',
    );
  }

  return { text, origin: url };
}

export async function readJobSource(input: string): Promise<JobSource> {
  if (input === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) throw new Error('Nenhum texto recebido via stdin.');
    return { text, origin: 'stdin' };
  }

  if (isUrl(input)) return fetchJobFromUrl(input);

  const file = path.resolve(process.cwd(), input);
  const text = await fs.readFile(file, 'utf8').catch(() => {
    throw new Error(
      `Nao encontrei "${input}". Passe uma URL, um arquivo .md/.txt ou "-" para ler da entrada padrao.`,
    );
  });

  if (text.trim().length < 80) {
    throw new Error('O arquivo da vaga parece vazio ou curto demais.');
  }

  return { text: text.trim(), origin: file };
}
