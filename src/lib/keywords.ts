import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { paths } from './paths.js';
import { deaccent } from './text.js';

const keywordSchema = z.object({
  term: z.string(),
  aliases: z.array(z.string()).default([]),
  evidence: z.string().optional(),
  pergunta: z.string().optional(),
});

export const bankSchema = z.object({
  core: z.array(keywordSchema).default([]),
  fortes: z.array(keywordSchema).default([]),
  aprendendo: z.array(keywordSchema).default([]),
  pendente: z.array(keywordSchema).default([]),
  soft: z.array(keywordSchema).default([]),
});

export type Keyword = z.infer<typeof keywordSchema>;
export type KeywordBank = z.infer<typeof bankSchema>;
export const TIERS = ['core', 'fortes', 'aprendendo', 'pendente', 'soft'] as const;
export type Tier = (typeof TIERS)[number];

export async function loadKeywords(
  filePath: string = path.join(paths.data, 'keywords.yaml'),
): Promise<KeywordBank> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => {
    throw new Error(
      `${filePath.replace(/\\/g, '/')} nao encontrado. Copie data/keywords.example.yaml para data/keywords.yaml.`,
    );
  });
  const { default: YAML } = await import('yaml');
  const parsed = bankSchema.safeParse(YAML.parse(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`data/keywords.yaml invalido:\n${issues}`);
  }
  return parsed.data;
}

function searchable(value: string): string {
  return deaccent(value).toLowerCase().replace(/\s+/g, ' ');
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Todas as formas reconhecidas de uma keyword (termo + aliases). */
export function variants(keyword: Keyword): string[] {
  return [keyword.term, ...keyword.aliases];
}

/**
 * Procura a keyword respeitando limites de palavra, para "Java" nao casar
 * dentro de "JavaScript" e "React" nao casar dentro de "ReactJS" (alias cobre).
 */
export function hasKeyword(text: string, keyword: Keyword): boolean {
  const haystack = searchable(text);
  return variants(keyword).some((variant) => {
    const pattern = new RegExp(
      `(?<![a-z0-9])${escapeRegExp(searchable(variant))}(?![a-z0-9])`,
      'i',
    );
    return pattern.test(haystack);
  });
}

export interface KeywordHit {
  term: string;
  tier: Tier;
  inJob: boolean;
  inCv: boolean;
  aliases: string[];
}

export interface Coverage {
  /** keywords que a vaga pede */
  requested: KeywordHit[];
  /** keywords do banco que a vaga nao pede (nao devem entrar por enfeite) */
  notRequested: KeywordHit[];
  score: number;
  missing: string[];
}

export function analyzeCoverage(jobText: string, cvText: string, bank: KeywordBank): Coverage {
  const hits: KeywordHit[] = [];
  for (const tier of TIERS) {
    for (const keyword of bank[tier]) {
      const inJob = hasKeyword(jobText, keyword);
      const inCv = hasKeyword(cvText, keyword);
      hits.push({ term: keyword.term, tier, inJob, inCv, aliases: keyword.aliases });
    }
  }

  const requested = hits.filter((hit) => hit.inJob);
  const missing = requested.filter((hit) => !hit.inCv).map((hit) => hit.term);
  const score =
    requested.length === 0
      ? 100
      : Math.round(((requested.length - missing.length) / requested.length) * 100);

  return {
    requested,
    notRequested: hits.filter((hit) => !hit.inJob),
    score,
    missing,
  };
}

/** Extrai termos que a vaga pede mas o banco nao conhece (para enriquecer o banco). */
export function unknownTerms(jobText: string, bank: KeywordBank, candidates: string[]): string[] {
  const known = TIERS.flatMap((tier) => bank[tier])
    .flatMap(variants)
    .map(searchable);
  return candidates.filter((candidate) => {
    const needle = searchable(candidate);
    if (needle.length < 2) return false;
    if (known.some((term) => term === needle)) return false;
    return hasKeyword(jobText, { term: candidate, aliases: [] });
  });
}
