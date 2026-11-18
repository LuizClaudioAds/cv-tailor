#!/usr/bin/env node
import { Command } from 'commander';
import { importCv } from './commands/import-cv.js';
import { checkJob, exportCommand, listJobs, previewJob } from './commands/jobs.js';
import { keywordsCommand } from './commands/keywords.js';
import { profileShow, profileValidate } from './commands/profile.js';
import { fixJob, tailor } from './commands/tailor.js';
import { ensureDirs } from './lib/paths.js';

const program = new Command();

program
  .name('cvtailor')
  .description('Adapta o curriculo base para cada vaga (analise de match + PDF/DOCX ATS-friendly).')
  .version('0.1.0')
  .showSuggestionAfterError()
  .hook('preAction', () => {
    ensureDirs();
  });

program
  .command('import-cv')
  .description('Extrai o texto do curriculo base (docx/pdf) e guarda em data/base/cv.txt')
  .argument('<arquivo>', 'caminho do curriculo (.docx, .pdf, .md ou .txt)')
  .option('--force', 'sobrescreve a extracao existente', false)
  .action(importCv);

program
  .command('tailor')
  .description('Gera curriculo adaptado + analise de match para uma vaga')
  .argument('<vaga>', 'URL, arquivo .md/.txt com a descricao ou "-" para ler do stdin')
  .option('--lang <idioma>', 'pt ou en (padrao: detecta pela vaga)')
  .option('--model <modelo>', 'modelo do OpenCode (provider/modelo)')
  .option('--cover', 'gera tambem cover-letter.md', false)
  .option('--dry-run', 'monta job.md e prompt.md sem chamar a IA', false)
  .action(async (vaga: string, options: { lang?: string; model?: string; cover: boolean; dryRun: boolean }) => {
    const lang = options.lang === 'en' || options.lang === 'pt' ? options.lang : undefined;
    if (options.lang && !lang) throw new Error('--lang aceita apenas "pt" ou "en".');
    await tailor(vaga, { lang, model: options.model, cover: options.cover, dryRun: options.dryRun });
  });

program
  .command('fix')
  .description('Reenvia um CV reprovado ao agente com o relatorio do validador')
  .argument('<slug>', 'pasta em jobs/')
  .option('--model <modelo>', 'modelo do OpenCode')
  .action((slug: string, options: { model?: string }) => fixJob(slug, options));

program
  .command('export')
  .description('Re-renderiza PDF/DOCX/MD a partir do cv.yaml de uma candidatura')
  .argument('<slug>', 'pasta em jobs/')
  .option('--no-pdf', 'nao gerar PDF')
  .option('--no-docx', 'nao gerar DOCX')
  .action((slug: string, options: { pdf: boolean; docx: boolean }) => exportCommand(slug, options));

program
  .command('list')
  .description('Lista candidaturas geradas com score de match')
  .action(listJobs);

program
  .command('check')
  .description('Valida fatos, keywords e paginas de uma candidatura')
  .argument('<slug>', 'pasta em jobs/')
  .action(checkJob);

program
  .command('preview')
  .description('Gera preview.png do CV para revisar o layout')
  .argument('<slug>', 'pasta em jobs/')
  .action(previewJob);

program
  .command('keywords')
  .description('Mostra o banco de keywords ATS (opcionalmente comparado com uma vaga)')
  .option('--job <arquivo|url>', 'analisa a cobertura do perfil para essa vaga')
  .action(keywordsCommand);

const profile = program.command('profile').description('Inspeciona e valida o curriculo base');

profile
  .command('validate')
  .description('Valida data/profile.yaml (schema, ids unicos)')
  .option('--file <arquivo>', 'valida outro perfil (ex.: data/profile.example.yaml)')
  .action(profileValidate);

profile
  .command('show')
  .description('Mostra o curriculo base como texto')
  .option('--section <secao>', 'identidade | resumo | skills | projetos | experiencia | formacao | certificacoes')
  .action(profileShow);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`erro: ${message}`);
  process.exitCode = 1;
});
