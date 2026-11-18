import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserType } from 'playwright-core';

function cachedChromium(): string | undefined {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;

  const executables: string[] = [];
  for (const entry of fs.readdirSync(base)) {
    if (!entry.startsWith('chromium')) continue;
    const root = path.join(base, entry);
    for (const candidate of [
      ['chrome-win', 'chrome.exe'],
      ['chrome-win64', 'chrome.exe'],
      ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
    ]) {
      const full = path.join(root, ...candidate);
      if (fs.existsSync(full)) executables.push(full);
    }
  }
  return executables.sort().at(-1);
}

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const type = chromium as BrowserType;
  const attempts: Array<() => Promise<Browser>> = [
    () => type.launch({ channel: 'msedge' }),
    () => type.launch({ channel: 'chrome' }),
  ];
  const cached = cachedChromium();
  if (cached) attempts.push(() => type.launch({ executablePath: cached }));

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error));
    }
  }
  throw new Error(
    'Nenhum navegador disponivel para gerar PDF. Instale o Edge/Chrome ou rode ' +
      `"npx playwright install chromium".\n${errors.join('\n')}`,
  );
}

export async function htmlToPdf(html: string, outputPath: string): Promise<void> {  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    await page.close();
    await fs.promises.writeFile(outputPath, pdf);
  } finally {
    await browser.close();
  }
}

/** Conta paginas do PDF gerado (usa o mesmo pdfjs da extracao). */
export async function countPdfPages(pdfPath: string): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.promises.readFile(pdfPath));
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;
  const pages = doc.numPages;
  await task.destroy();
  return pages;
}
