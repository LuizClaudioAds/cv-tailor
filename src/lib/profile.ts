import fs from 'node:fs/promises';
import { z } from 'zod';
import { paths } from './paths.js';
import { repairProfileYaml } from './yaml-repair.js';
import { normalize } from './text.js';

const yearish = z.union([z.string(), z.number()]).transform((value) => String(value));

const periodSchema = z
  .object({
    start: yearish,
    end: yearish.optional(),
    current: z.boolean().optional(),
  })
  .refine((period) => Boolean(period.end || period.current), {
    message: 'period precisa ter "end" ou "current: true"',
  });

export const bulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(10),
});

const balanced = (value: string) =>
  (value.match(/\(/g)?.length ?? 0) === (value.match(/\)/g)?.length ?? 0);

/**
 * Item de skill com parenteses desbalanceados normalmente significa YAML quebrado:
 * em listas inline (`[a, b]`), uma virgula dentro de parenteses divide o item em dois.
 */
const balancedItem = z.string().refine(balanced, {
  message:
    'parenteses desbalanceados — em listas inline ([a, b]) use aspas quando houver virgula ' +
    'dentro de parenteses, ex.: "Testes automatizados (Vitest, Playwright)"',
});

export const profileSchema = z.object({
  identity: z.object({
    name: z.string().min(3),
    headline: z.string().min(3),
    headline_en: z.string().optional(),
    headline_variants: z.array(z.string()).default([]),
    headline_variants_en: z.array(z.string()).default([]),
    location: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(8),
    links: z.record(z.string(), z.string()).default({}),
  }),
  summary: z.object({ pt: z.string().min(50), en: z.string().optional() }),
  development: z
    .object({
      practice_pt: z.string().optional(),
      practice_en: z.string().optional(),
    })
    .default({}),
  skills: z
    .array(
      z.object({
        group: z.string(),
        group_en: z.string().optional(),
        items: z.array(balancedItem).min(1),
      }),
    )
    .min(1),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      name_en: z.string().optional(),
      stack: z.array(z.string()).default([]),
      role: z.string().optional(),
      role_en: z.string().optional(),
      repo: z.string().optional(),
      demo: z.string().optional(),
      bullets: z.array(bulletSchema).min(1),
    }),
  ),
  experience: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      company_en: z.string().optional(),
      role: z.string(),
      role_en: z.string().optional(),
      role_context: z.string().optional(),
      role_context_en: z.string().optional(),
      period: periodSchema,
      location: z.string().optional(),
      bullets: z.array(bulletSchema).min(1),
    }),
  ),
  education: z.array(
    z.object({
      id: z.string(),
      course: z.string(),
      course_en: z.string().optional(),
      institution: z.string(),
      status: z.string(),
      status_en: z.string().optional(),
      expected_end: z.string().optional(),
      end: yearish.optional(),
    }),
  ),
  certifications: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        issuer: z.string(),
        hours: z.number().positive().optional(),
      }),
    )
    .default([]),
  languages: z.array(
    z.object({
      name: z.string(),
      name_en: z.string().optional(),
      level: z.string(),
      level_en: z.string().optional(),
    }),
  ),
  facts: z.array(z.string()).default([]),
  pending: z.array(z.string()).default([]),
});

export type Profile = z.infer<typeof profileSchema>;
export type Bullet = z.infer<typeof bulletSchema>;

export async function loadProfile(filePath: string = paths.profile): Promise<Profile> {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => {
    throw new Error(
      `${filePath.replace(/\\/g, '/')} nao encontrado. Copie data/profile.example.yaml para data/profile.yaml.`,
    );
  });
  const { default: YAML } = await import('yaml');
  const parsed = profileSchema.safeParse(repairProfileYaml(YAML.parse(raw)));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`data/profile.yaml invalido:\n${issues}`);
  }
  return parsed.data;
}

export interface ProfileIndex {
  /** id do bullet -> texto original */
  bullets: Map<string, string>;
  /** ids duplicados encontrados (erro de consistencia) */
  duplicateBulletIds: string[];
  companies: string[];
  roles: string[];
  institutions: string[];
  projects: string[];
  /** numeros citados no curriculo base, sem separador de milhar */
  numbers: string[];
}

export function indexProfile(profile: Profile): ProfileIndex {
  const bullets = new Map<string, string>();
  const duplicates: string[] = [];
  const roles: string[] = [];
  const projects: string[] = [];

  const addBullets = (group: Bullet[]) => {
    for (const bullet of group) {
      if (bullets.has(bullet.id)) duplicates.push(bullet.id);
      bullets.set(bullet.id, bullet.text);
    }
  };

  for (const item of profile.projects) {
    addBullets(item.bullets);
    projects.push(item.name);
    if (item.name_en) projects.push(item.name_en);
  }

  for (const item of profile.experience) {
    addBullets(item.bullets);
    roles.push(item.role);
    if (item.role_en) roles.push(item.role_en);
  }

  const textCorpus = [
    profile.summary.pt,
    profile.summary.en ?? '',
    ...bullets.values(),
    ...profile.facts,
  ].join(' ');

  return {
    bullets,
    duplicateBulletIds: duplicates,
    companies: [
      ...profile.experience.map((item) => item.company),
      ...profile.experience.flatMap((item) => (item.company_en ? [item.company_en] : [])),
    ],
    roles,
    institutions: profile.education.map((item) => item.institution),
    projects,
    numbers: [...new Set(textCorpus.match(/\d[\d.,]*\s*(?:x|%)?/gi) ?? [])].map((value) =>
      value.replace(/\s+/g, ''),
    ),
  };
}

/** Texto legivel do bullet, sem acento e minusculo, para comparacao. */
export function comparable(value: string): string {
  return normalize(value).replace(/[^a-z0-9\s]/g, '');
}
