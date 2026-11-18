import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser, BrowserType } from 'playwright-core';

/** Diretorio onde o Playwright guarda os navegadores, por sistema operacional. */
function browserCacheDirs(): string[] {
  const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (fromEnv && fromEnv !== '0') return [fromEnv];

  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return [path.join(local, 'ms-playwright')];
  }
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Caches', 'ms-playwright')];
  }
  return [path.join(process.env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'ms-playwright')];
}

const CACHE_CANDIDATES: Record<string, string[][]> = {
  win32: [
    ['chrome-win64', 'chrome.exe'],
    ['chrome-win', 'chrome.exe'],
    ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
    ['chrome-headless-shell-win32', 'chrome-headless-shell.exe'],
  ],
  darwin: [
    ['chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
    ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
  ],
  linux: [
    ['chrome-linux64', 'chrome'],
    ['chrome-linux', 'chrome'],
    ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ],
};

const SYSTEM_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

function cachedChromium(): string | undefined {
  const relative = CACHE_CANDIDATES[process.platform] ?? [];
  const found: string[] = [];

  for (const base of browserCacheDirs()) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      if (!entry.startsWith('chromium')) continue;
      for (const suffix of relative) {
        const candidate = path.join(base, entry, ...suffix);
        if (fs.existsSync(candidate)) found.push(candidate);
      }
    }
  }

  return found.sort().at(-1);
}

function systemChrome(): string | undefined {
  return (SYSTEM_CANDIDATES[process.platform] ?? []).find((candidate) => fs.existsSync(candidate));
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

  const system = systemChrome();
  if (system && system !== cached) attempts.push(() => type.launch({ executablePath: system }));

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error));
    }
  }

  throw new Error(
    'Nenhum navegador disponivel para gerar PDF. Instale o Chromium com:\n' +
      '  npx playwright-core install chromium\n' +
      'ou instale o Google Chrome / Microsoft Edge.\n' +
      `Tentativas: ${errors.length}`,
  );
}

export async function htmlToPdf(html: string, outputPath: string): Promise<void> {
  const browser = await launchBrowser();
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
