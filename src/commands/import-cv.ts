import fs from 'node:fs/promises';
import path from 'node:path';
import { detectFormat, extractCv } from '../lib/extract.js';
import { ensureDirs, paths, rel } from '../lib/paths.js';
import { countWords, tidyText } from '../lib/text.js';

export interface ImportCvOptions {
  force: boolean;
}

export async function importCv(arquivo: string, options: ImportCvOptions): Promise<void> {
  ensureDirs();

  const source = path.resolve(process.cwd(), arquivo);
  await fs.access(source);
  detectFormat(source);

  const target = path.join(paths.base, 'cv.txt');
  const previous = await fs.readFile(target, 'utf8').catch(() => null);

  const { format, text } = await extractCv(source);

  if (!text || countWords(text) < 30) {
    throw new Error(
      `Extracao vazia ou muito curta (${countWords(text)} palavras). ` +
        'O arquivo pode ser PDF escaneado (imagem) ou estar protegido.',
    );
  }

  if (previous && !options.force) {
    const same = tidyText(previous) === text;
    console.log(
      same
        ? 'Extracao identica a anterior (nada a fazer).'
        : 'Ja existe data/base/cv.txt. Use --force para sobrescrever.',
    );
    if (!same) process.exitCode = 1;
    return;
  }

  await fs.writeFile(target, `${text}\n`, 'utf8');

  const copyName = await uniqueName(path.join(paths.base, path.basename(source)));
  await fs.copyFile(source, copyName);

  console.log(`Formato........: ${format}`);
  console.log(`Arquivo base...: ${rel(copyName)}`);
  console.log(`Texto extraido.: ${rel(target)}`);
  console.log(`Volume.........: ${countWords(text)} palavras, ${text.length} caracteres`);
}

async function uniqueName(candidate: string): Promise<string> {
  const parsed = path.parse(candidate);
  let attempt = candidate;
  let counter = 2;
  for (;;) {
    const exists = await fs.access(attempt).then(
      () => true,
      () => false,
    );
    if (!exists) return attempt;
    attempt = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
  }
}
