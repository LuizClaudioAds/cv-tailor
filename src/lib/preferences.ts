import fs from 'node:fs/promises';
import { z } from 'zod';
import { paths } from './paths.js';

export const preferencesSchema = z.object({
  work_model: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  seniority: z.array(z.string()).default([]),
  salary_expectation: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  relocation: z.boolean().default(false),
  default_language: z.enum(['pt', 'en']).default('pt'),
  max_pages: z.number().int().min(1).max(3).default(1),
  section_order: z.array(z.string()).default([]),
  tone: z.string().optional(),
  avoid: z.array(z.string()).default([]),
  notes: z.string().optional(),
  model: z.string().nullable().optional(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export async function loadPreferences(): Promise<Preferences> {
  const raw = await fs.readFile(paths.preferences, 'utf8').catch(() => '');
  if (!raw) return preferencesSchema.parse({});
  const { default: YAML } = await import('yaml');
  const parsed = preferencesSchema.safeParse(YAML.parse(raw) ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`data/preferences.yaml invalido:\n${issues}`);
  }
  return parsed.data;
}
