import fs from 'node:fs/promises';
import path from 'node:path';
import { tidyText } from './text.js';

export type CvFormat = 'docx' | 'pdf' | 'text';

export function detectFormat(filePath: string): CvFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (['.md', '.txt', '.markdown'].includes(ext)) return 'text';
  throw new Error(
    `Formato nao suportado: ${ext || '(sem extensao)'}. Use .docx, .pdf, .md ou .txt.`,
  );
}

/**
 * Extrai texto puro do curriculo base.
 * DOCX e a via preferida (preserva paragrafos e ordem); PDF e o fallback.
 */
export async function extractCv(filePath: string): Promise<{ format: CvFormat; text: string }> {
  const format = detectFormat(filePath);

  if (format === 'text') {
    return { format, text: tidyText(await fs.readFile(filePath, 'utf8')) };
  }

  if (format === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return { format, text: tidyText(result.value) };
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(filePath));
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;

  const pages: string[] = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    let current = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      current += item.str;
      if (item.hasEOL) current += '\n';
    }
    pages.push(current.trim());
    page.cleanup();
  }
  await task.destroy();

  return { format, text: tidyText(pages.join('\n\n')) };
}
