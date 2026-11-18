import fs from 'node:fs/promises';
import path from 'node:path';
import { loadKeywords } from '../lib/keywords.js';
import { loadPreferences } from '../lib/preferences.js';
import { loadProfile } from '../lib/profile.js';
import { slugify } from '../lib/text.js';

const PT_STOPWORDS = [' para ', ' com ', ' voc', ' n', ' experi', ' desenvol', ' trabalho', ' anos '];
const EN_STOPWORDS = [' the ', ' and ', ' with ', ' experience', ' develop', ' years ', ' you '];

export function detectLanguage(text: string): 'pt' | 'en' {
  const lowered = text.toLowerCase();
  const pt = PT_STOPWORDS.reduce((sum, word) => sum + countOccurrences(lowered, word), 0);
  const en = EN_STOPWORDS.reduce((sum, word) => sum + countOccurrences(lowered, word), 0);
  return en > pt * 1.2 ? 'en' : 'pt';
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

export interface TailorOptions {
  lang?: 'pt' | 'en';
  model?: string;
  company?: string;
  cover?: boolean;
  dryRun?: boolean;
}

export interface TailorResult {
  jobDir: string;
  slug: string;
}

export async function tailor(jobInput: string, options: TailorOptions): Promise<TailorResult> {
  const { paths } = await import('../lib/paths.js');
  const { readJobSource } = await import('../lib/job-input.js');
  const { runCvAgent } = await import('../lib/agent.js');

  const profile = await loadProfile();
  await loadKeywords(); // valida o banco antes de gastar tokens

  const job = await readJobSource(jobInput);
  const lang = options.lang ?? detectLanguage(job.text);

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const pendingDir = paths.jobDir(`_pending-${stamp}`);
  await fs.mkdir(pendingDir, { recursive: true });

  const jobFile = path.join(pendingDir, 'job.md');
  await fs.writeFile(
    jobFile,
    `# Vaga\n\n- Origem: ${job.origin}\n- Idioma detectado: ${lang}\n- Data: ${new Date().toISOString().slice(0, 10)}\n\n---\n\n${job.text}\n`,
    'utf8',
  );

  const promptFile = path.join(pendingDir, 'prompt.md');
  const prompt = await buildPrompt({
    outputDir: path.relative(paths.root, pendingDir).split(path.sep).join('/'),
    lang,
    jobText: job.text,
    cover: options.cover ?? false,
  });
  await fs.writeFile(promptFile, prompt, 'utf8');

  if (options.dryRun) {
    console.log(`Job e prompt gravados em ${path.relative(process.cwd(), pendingDir)}`);
    console.log('Nada foi enviado ao agente (--dry-run).');
    return { jobDir: pendingDir, slug: path.basename(pendingDir) };
  }

  const preferences = await loadPreferences();
  const model = options.model ?? preferences.model ?? undefined;

  console.log(`Vaga salva em ${path.relative(process.cwd(), jobFile)}`);
  console.log(`Idioma do CV: ${lang.toUpperCase()} Â· modelo: ${model ?? 'padrao'}`);
  console.log('Executando o agente (pode levar 1-3 minutos)...\n');

  await runCvAgent({
    promptPath: path.relative(paths.root, promptFile),
    cwd: paths.root,
    model,
    message: options.cover
      ? 'Gere analysis.md, cv.yaml e cover-letter.md seguindo o prompt anexado.'
      : 'Gere analysis.md e cv.yaml seguindo o prompt anexado.',
  });

  const { readCvYaml, exportJob } = await import('../lib/export.js');
  const cv = await readCvYaml(path.join(pendingDir, 'cv.yaml'));

  const finalSlug = await uniqueSlug(
    slugify(`${cv.meta.company}-${cv.meta.role}`, 60) || path.basename(pendingDir),
  );
  const finalDir = paths.jobDir(finalSlug);
  await fs.rename(pendingDir, finalDir);

  const result = await exportJob(finalDir);
  const { validateCv } = await import('../lib/validate.js');
  const bank = await loadKeywords();
  const report = validateCv(cv, profile, job.text, bank);

  if (result.pageCount && result.pageCount > preferences.max_pages) {
    report.errors.push(
      `PDF tem ${result.pageCount} paginas (limite: ${preferences.max_pages}). ` +
        'Corte um projeto, reduza bullets e encurte o resumo.',
    );
  }

  printReport(report, finalDir);
  console.log('');
  console.log(`Curriculo: ${path.relative(process.cwd(), finalDir)}`);
  for (const file of result.files) console.log(`  - ${path.basename(file)}`);

  if (report.errors.length > 0) {
    const error = new Error(
      'O CV gerado violou regras de integridade. Arquivos mantidos para inspecao.\n' +
        `Rode "cvtailor fix ${finalSlug}" para o agente corrigir.`,
    );
    error.name = 'ValidationError';
    throw error;
  }

  return { jobDir: finalDir, slug: finalSlug };
}

export function printReport(report: { errors: string[]; warnings: string[]; coverage: { score: number; missing: string[] } | null }, jobDir: string): void {
  if (report.coverage) {
    console.log(`Cobertura de keywords da vaga: ${report.coverage.score}%`);
    if (report.coverage.missing.length > 0) {
      console.log(`  Ausentes: ${report.coverage.missing.join(', ')}`);
    }
  }
  for (const warning of report.warnings) console.log(`aviso: ${warning}`);
  for (const error of report.errors) console.error(`erro: ${error}`);
  if (report.errors.length === 0) console.log('Validacao de fatos: OK');
  void jobDir;
}

export async function fixJob(slug: string, options: { model?: string }): Promise<void> {
  const { paths } = await import('../lib/paths.js');
  const { readCvYaml, exportJob } = await import('../lib/export.js');
  const { validateCv } = await import('../lib/validate.js');
  const { loadKeywords } = await import('../lib/keywords.js');
  const { runCvAgent } = await import('../lib/agent.js');

  const jobDir = paths.jobDir(slug);
  await fs.access(jobDir);

  const profile = await loadProfile();
  const bank = await loadKeywords();
  const jobText = await fs
    .readFile(path.join(jobDir, 'job.md'), 'utf8')
    .catch(() => {
      throw new Error(`job.md nao encontrado em jobs/${slug}.`);
    });

  const cv = await readCvYaml(path.join(jobDir, 'cv.yaml'));
  const report = validateCv(cv, profile, jobText, bank);

  const prefs = await loadPreferences();
  const existingPdf = (await fs.readdir(jobDir).catch(() => [])).find((file) => file.endsWith('.pdf'));
  if (existingPdf) {
    const { countPdfPages } = await import('../lib/pdf.js');
    const pages = await countPdfPages(path.join(jobDir, existingPdf));
    if (pages > prefs.max_pages) {
      report.errors.push(
        `PDF tem ${pages} paginas (limite: ${prefs.max_pages}). Corte um projeto, reduza bullets e encurte o resumo.`,
      );
    }
  }

  if (report.errors.length === 0 && report.warnings.length === 0) {
    console.log('Nada a corrigir.');
    return;
  }

  const promptFile = path.join(jobDir, 'prompt-fix.md');
  const prompt = await buildPrompt({
    outputDir: path.relative(paths.root, jobDir).split(path.sep).join('/'),
    lang: cv.meta.lang,
    jobText,
    cover: await fs
      .access(path.join(jobDir, 'cover-letter.md'))
      .then(() => true)
      .catch(() => false),
    fix: [...report.errors, ...report.warnings],
    existingCv: await fs.readFile(path.join(jobDir, 'cv.yaml'), 'utf8'),
  });
  await fs.writeFile(promptFile, prompt, 'utf8');

  console.log(`Corrigindo ${slug} (${report.errors.length} erros, ${report.warnings.length} avisos)...`);
  await runCvAgent({
    promptPath: path.relative(paths.root, promptFile),
    cwd: paths.root,
    model: options.model ?? prefs.model ?? undefined,
    message: 'Corrija cv.yaml conforme o relatorio do validador no prompt anexado.',
  });

  const corrected = await readCvYaml(path.join(jobDir, 'cv.yaml'));
  const result = await exportJob(jobDir);
  const finalReport = validateCv(corrected, profile, jobText, bank);
  if (result.pageCount && result.pageCount > prefs.max_pages) {
    finalReport.errors.push(
      `PDF continua com ${result.pageCount} paginas (limite: ${prefs.max_pages}). Corte conteudo manualmente no cv.yaml.`,
    );
  }
  printReport(finalReport, jobDir);
  if (finalReport.errors.length > 0) process.exitCode = 1;
}

async function buildPrompt(input: {
  outputDir: string;
  lang: 'pt' | 'en';
  jobText: string;
  cover: boolean;
  fix?: string[];
  existingCv?: string;
}): Promise<string> {
  const { paths } = await import('../lib/paths.js');
  const template = await fs.readFile(path.join(paths.prompts, 'tailor.md'), 'utf8');
  const preferences = await loadPreferences();

  const fixSection = input.fix?.length
    ? [
        '',
        '## Correcao (tentativa anterior)',
        'O validador reprovou a versao anterior. Corrija APENAS os pontos abaixo e reescreva cv.yaml completo.',
        ...input.fix.map((item) => `- ${item}`),
        '',
        '### cv.yaml atual (referencia)',
        '```yaml',
        input.existingCv?.trim() ?? '',
        '```',
      ].join('\n')
    : '';

  const coverSection = input.cover
    ? [
        '',
        '## Alem do CV',
        `Escreva tambem \`cover-letter.md\` em ${input.lang === 'en' ? 'ingles' : 'portugues'}:`,
        '- 150 a 220 palavras, direta, sem clichÃª',
        '- cite 2 evidencias concretas do perfil que respondem aos requisitos da vaga',
        '- sem inventar experiencia; mencionar gap somente se for inevitavel (tom construtivo)',
      ].join('\n')
    : '';

  return template
    .replaceAll('{{PROFILE_PATH}}', 'data/profile.yaml')
    .replaceAll('{{OUTPUT_DIR}}', input.outputDir)
    .replaceAll('{{LANG}}', input.lang)
    .replaceAll('{{MAX_PAGES}}', String(preferences.max_pages))
    .replaceAll('{{FIX_SECTION}}', fixSection)
    .replaceAll('{{JOB_TEXT}}', `${input.jobText.trim()}\n${coverSection}`);
}

async function uniqueSlug(base: string): Promise<string> {
  const { paths } = await import('../lib/paths.js');
  let candidate = base;
  let counter = 2;
  for (;;) {
    const exists = await fs
      .access(paths.jobDir(candidate))
      .then(() => true)
      .catch(() => false);
    if (!exists) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}
