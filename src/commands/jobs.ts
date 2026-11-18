import fs from 'node:fs/promises';
import path from 'node:path';
import { exportJob } from '../lib/export.js';
import { paths, rel } from '../lib/paths.js';

export async function listJobs(): Promise<void> {
  const entries = await fs.readdir(paths.jobs, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'));
  if (dirs.length === 0) {
    console.log('Nenhuma candidatura ainda. Rode "cvtailor tailor <vaga>".');
    return;
  }

  const rows: Array<{ slug: string; company: string; role: string; score: string; files: string }> = [];
  for (const dir of dirs) {
    const jobDir = paths.jobDir(dir.name);
    const { default: YAML } = await import('yaml');
    const meta = await fs
      .readFile(path.join(jobDir, 'cv.yaml'), 'utf8')
      .then((raw) => {
        const parsed = YAML.parse(raw) as {
          meta?: { company?: string; role?: string; match_score?: number };
        };
        const meta: { company?: string; role?: string; match_score?: number } = parsed.meta ?? {};
        return meta;
      })
      .catch((): { company?: string; role?: string; match_score?: number } => ({}));

    const files = (await fs.readdir(jobDir)).filter((file) => /\.(pdf|docx|md|yaml)$/i.test(file));
    rows.push({
      slug: dir.name,
      company: meta.company ?? '—',
      role: meta.role ?? '—',
      score: meta.match_score !== undefined ? `${meta.match_score}%` : '—',
      files: files.length > 0 ? files.join(', ') : '—',
    });
  }

  const width = Math.max(...rows.map((row) => row.slug.length), 4);
  console.log(`${'SLUG'.padEnd(width)}  MATCH  EMPRESA / CARGO`);
  for (const row of rows) {
    console.log(`${row.slug.padEnd(width)}  ${row.score.padStart(5)}  ${row.company} — ${row.role}`);
  }
  console.log('');
  console.log('Detalhes: cvtailor export <slug>  |  abra jobs/<slug>/analysis.md');
}

export async function checkJob(slug: string): Promise<void> {
  const jobDir = paths.jobDir(slug);
  const { readCvYaml } = await import('../lib/export.js');
  const { loadKeywords } = await import('../lib/keywords.js');
  const { loadProfile } = await import('../lib/profile.js');
  const { validateCv } = await import('../lib/validate.js');
  const { countPdfPages } = await import('../lib/pdf.js');

  const cv = await readCvYaml(path.join(jobDir, 'cv.yaml'));
  const profile = await loadProfile();
  const bank = await loadKeywords();
  const jobText = await fs.readFile(path.join(jobDir, 'job.md'), 'utf8');
  const report = validateCv(cv, profile, jobText, bank);

  const pdf = (await fs.readdir(jobDir).catch(() => [])).find((file) => file.endsWith('.pdf'));
  if (pdf) {
    const pages = await countPdfPages(path.join(jobDir, pdf));
    console.log(`PDF: ${pages} pagina(s)`);
  }

  console.log(`Cobertura de keywords: ${report.coverage?.score ?? '—'}%`);
  if (report.coverage?.missing.length) {
    console.log(`  Ausentes: ${report.coverage.missing.join(', ')}`);
  }
  for (const warning of report.warnings) console.log(`aviso: ${warning}`);
  for (const error of report.errors) console.error(`erro: ${error}`);
  if (report.errors.length === 0) console.log('Validacao de fatos: OK');
  if (report.errors.length > 0) process.exitCode = 1;
}

export async function previewJob(slug: string): Promise<void> {
  const jobDir = paths.jobDir(slug);
  const { readCvYaml } = await import('../lib/export.js');
  const { loadProfile } = await import('../lib/profile.js');
  const { loadTemplate, renderHtml } = await import('../lib/render.js');
  const { launchBrowser } = await import('../lib/pdf.js');

  const cv = await readCvYaml(path.join(jobDir, 'cv.yaml'));
  const profile = await loadProfile();
  const html = renderHtml(cv, profile, await loadTemplate());
  const output = path.join(jobDir, 'preview.png');

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: output, fullPage: true });
    await page.close();
  } finally {
    await browser.close();
  }

  const size = await fs.stat(output);
  console.log(`Preview: ${rel(output)} (${Math.round(size.size / 1024)} KB)`);
  console.log('Abra a imagem para revisar o layout antes de enviar.');
}

export async function exportCommand(
  slug: string,
  options: { pdf: boolean; docx: boolean },
): Promise<void> {
  const jobDir = paths.jobDir(slug);
  await fs.access(jobDir).catch(() => {
    throw new Error(`jobs/${slug} nao existe. Veja "cvtailor list".`);
  });

  const result = await exportJob(jobDir, { pdf: options.pdf, docx: options.docx, markdown: true });
  console.log(`Reexportado: ${rel(jobDir)}`);
  for (const file of result.files) console.log(`  - ${path.basename(file)}`);
}
