import path from 'node:path';
import { readCvYaml } from '../src/lib/export.js';
import { launchBrowser } from '../src/lib/pdf.js';
import { loadProfile } from '../src/lib/profile.js';
import { loadTemplate, renderHtml } from '../src/lib/render.js';
import { validateCv } from '../src/lib/validate.js';
import { loadKeywords } from '../src/lib/keywords.js';

const profilePath = path.resolve('data/profile.example.yaml');
const cvPath = path.resolve('docs/example-cv.yaml');
const output = path.resolve('docs/preview.png');

const profile = await loadProfile(profilePath);
const cv = await readCvYaml(cvPath);
const bank = await loadKeywords(path.resolve('data/keywords.example.yaml'));

const report = validateCv(cv, profile, '', bank);
if (report.errors.length > 0) {
  console.error('CV de exemplo invalido:');
  for (const error of report.errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  const html = renderHtml(cv, profile, await loadTemplate());
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: output, fullPage: true });
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`Preview gerado: ${output}`);
}
