import fs from 'node:fs/promises';
import path from 'node:path';
import { cvSchema, type TailoredCv } from './cv-schema.js';
import { writeDocx } from './docx.js';
import { htmlToPdf } from './pdf.js';
import { loadProfile, indexProfile, type Profile } from './profile.js';
import { loadTemplate, renderHtml, renderMarkdown } from './render.js';
import { slugify } from './text.js';
import { repairCvYaml } from './yaml-repair.js';

export interface ExportOptions {
  pdf?: boolean;
  docx?: boolean;
  markdown?: boolean;
}

export interface ExportResult {
  cv: TailoredCv;
  profile: Profile;
  files: string[];
  pageCount: number | null;
}

export async function readCvYaml(filePath: string): Promise<TailoredCv> {
  const { default: YAML } = await import('yaml');
  const raw = await fs.readFile(filePath, 'utf8').catch(() => {
    throw new Error(`Nao encontrei ${filePath}. O agente deveria ter escrito esse arquivo.`);
  });

  let data: unknown;
  try {
    data = YAML.parse(raw);
  } catch (error) {
    throw new Error(
      `YAML invalido em ${filePath}: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }

  const parsed = cvSchema.safeParse(repairCvYaml(data));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`cv.yaml fora do schema:\n${issues}`);
  }
  return parsed.data;
}

export async function exportJob(
  jobDir: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const profile = await loadProfile();
  const index = indexProfile(profile);
  if (index.duplicateBulletIds.length > 0) {
    throw new Error(`IDs duplicados no profile: ${index.duplicateBulletIds.join(', ')}`);
  }

  const cv = await readCvYaml(path.join(jobDir, 'cv.yaml'));
  const template = await loadTemplate();
  const baseName = fileNameBase(profile.identity.name, cv.meta.role, cv.meta.company);
  const files: string[] = [];
  let pageCount: number | null = null;

  // Remove PDFs/DOCX de execucoes anteriores (o nome do arquivo muda com cargo/empresa).
  for (const entry of await fs.readdir(jobDir).catch(() => [])) {
    if (/\.(pdf|docx)$/i.test(entry)) await fs.rm(path.join(jobDir, entry), { force: true });
  }

  if (options.markdown !== false) {
    const mdPath = path.join(jobDir, 'cv.md');
    await fs.writeFile(mdPath, renderMarkdown(cv, profile), 'utf8');
    files.push(mdPath);
  }

  if (options.docx !== false) {
    const docxPath = path.join(jobDir, `${baseName}.docx`);
    await writeDocx(cv, profile, docxPath);
    files.push(docxPath);
  }

  if (options.pdf !== false) {
    const pdfPath = path.join(jobDir, `${baseName}.pdf`);
    await htmlToPdf(renderHtml(cv, profile, template), pdfPath);
    files.push(pdfPath);
    const { countPdfPages } = await import('./pdf.js');
    pageCount = await countPdfPages(pdfPath);
  }

  return { cv, profile, files, pageCount };
}

/** Nome de arquivo ATS-friendly: Nome-Sobrenome-Cargo-Empresa.pdf */
export function fileNameBase(name: string, role: string, company: string): string {
  const cleanName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .slice(0, 2)
    .join('-');
  return slugify(`${cleanName}-${role}-${company}`, 70) || 'curriculo';
}
