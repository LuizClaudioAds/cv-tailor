import { z } from 'zod';

const cvBullet = z.object({
  ref: z.string().min(1),
  text: z.string().min(20).max(400),
});

export const cvSchema = z.object({
  meta: z.object({
    company: z.string().min(1),
    role: z.string().min(1),
    lang: z.enum(['pt', 'en']),
    headline: z.string().min(3),
    match_score: z.number().min(0).max(100).optional(),
  }),
  summary: z.string().min(80).max(1000),
  skills: z
    .array(
      z.object({
        group: z.string().min(2),
        items: z.array(z.string().min(1)).min(1).max(12),
      }),
    )
    .max(8)
    .default([]),
  projects: z
    .array(
      z.object({
        ref: z.string().min(1),
        name: z.string().min(3),
        stack: z.array(z.string()).default([]),
        link: z.string().optional(),
        bullets: z.array(cvBullet).min(1).max(4),
      }),
    )
    .max(4)
    .default([]),
  experience: z
    .array(
      z.object({
        ref: z.string().min(1),
        role: z.string().min(2),
        company: z.string().min(2),
        context: z.string().optional(),
        period: z.string().min(4),
        bullets: z.array(cvBullet).min(0).max(5),
      }),
    )
    .max(4)
    .default([]),
  education: z
    .array(
      z.object({
        ref: z.string().min(1),
        course: z.string().min(3),
        institution: z.string().min(2),
        detail: z.string().optional(),
      }),
    )
    .default([]),
  certifications: z
    .array(
      z.object({
        ref: z.string().min(1),
        name: z.string().min(3),
        detail: z.string().optional(),
      }),
    )
    .default([]),
  languages: z.array(z.string()).default([]),
});

export type TailoredCv = z.infer<typeof cvSchema>;
