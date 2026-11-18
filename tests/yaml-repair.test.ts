import { describe, expect, it } from 'vitest';
import { joinParenthesized, repairCvYaml, repairProfileYaml } from '../src/lib/yaml-repair.js';

describe('reparo de YAML inline', () => {
  it('junta item quebrado por virgula dentro de parenteses', () => {
    expect(joinParenthesized(['Testes automatizados (Vitest', 'Playwright)'])).toEqual([
      'Testes automatizados (Vitest, Playwright)',
    ]);
  });

  it('junta tres pedacos', () => {
    expect(joinParenthesized(['Stack (A', 'B', 'C)'])).toEqual(['Stack (A, B, C)']);
  });

  it('nao mexe em itens saudaveis', () => {
    expect(joinParenthesized(['React', 'Next.js', 'CI/CD (GitHub Actions)'])).toEqual([
      'React',
      'Next.js',
      'CI/CD (GitHub Actions)',
    ]);
  });

  it('repara skills e stack do cv.yaml', () => {
    const repaired = repairCvYaml({
      skills: [{ group: 'Qualidade', items: ['Testes (Vitest', 'Playwright)'] }],
      projects: [{ ref: 'x', stack: ['Next (App', 'Router)'] }],
    }) as {
      skills: { items: string[] }[];
      projects: { stack: string[] }[];
    };

    expect(repaired.skills[0]!.items).toEqual(['Testes (Vitest, Playwright)']);
    expect(repaired.projects[0]!.stack).toEqual(['Next (App, Router)']);
  });

  it('repara skills do profile.yaml', () => {
    const repaired = repairProfileYaml({
      skills: [{ group: 'Fundamentos', items: ['Metodologias Ágeis (Scrum', 'Kanban)'] }],
    }) as { skills: { items: string[] }[] };

    expect(repaired.skills[0]!.items).toEqual(['Metodologias Ágeis (Scrum, Kanban)']);
  });

  it('preserva dados inesperados sem quebrar', () => {
    expect(repairCvYaml(null)).toBeNull();
    expect(repairCvYaml('texto')).toBe('texto');
    expect(repairProfileYaml({ skills: 'nada' })).toEqual({ skills: 'nada' });
  });
});
