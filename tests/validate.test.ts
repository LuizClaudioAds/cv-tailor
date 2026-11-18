import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TailoredCv } from '../src/lib/cv-schema.js';
import { loadKeywords, type KeywordBank } from '../src/lib/keywords.js';
import { loadProfile } from '../src/lib/profile.js';
import { validateCv } from '../src/lib/validate.js';

const PROFILE = path.resolve('data/profile.example.yaml');
const KEYWORDS = path.resolve('data/keywords.example.yaml');

function baseCv(): TailoredCv {
  return {
    meta: {
      company: 'Acme Tecnologia',
      role: 'Desenvolvedora Front-end Júnior',
      lang: 'pt',
      headline: 'Desenvolvedora Front-end Júnior',
      match_score: 80,
    },
    summary:
      'Desenvolvedora Front-end Júnior com experiência em React, TypeScript e Next.js. ' +
      'Reduzi de ~2 horas para ~40 minutos uma rotina operacional diária (~65% menos tempo), ' +
      'com testes automatizados, CI no GitHub Actions e deploy contínuo.',
    skills: [
      { group: 'Linguagens', items: ['JavaScript', 'TypeScript', 'SQL'] },
      { group: 'Frontend', items: ['React', 'Next.js', 'HTML', 'CSS', 'Tailwind CSS'] },
      { group: 'Backend', items: ['Node.js', 'APIs REST'] },
      {
        group: 'Qualidade e DevOps',
        items: ['Testes automatizados (Vitest, Playwright)', 'Git', 'GitHub'],
      },
    ],
    projects: [
      {
        ref: 'painel-interno',
        name: 'Painel Interno de Relatórios',
        stack: ['Next.js', 'TypeScript', 'React'],
        link: 'https://github.com/exemplo/painel-interno',
        bullets: [
          {
            ref: 'proj-1',
            text: 'Desenvolvi uma aplicação web em Next.js, TypeScript e Tailwind para padronizar relatórios internos.',
          },
          {
            ref: 'proj-3',
            text: 'Reduzi de ~2 horas para ~40 minutos a rotina diária de digitação de relatórios (~65% menos tempo).',
          },
        ],
      },
    ],
    experience: [
      {
        ref: 'acme',
        role: 'Analista Operacional',
        company: 'Acme Tecnologia',
        context: 'rotina operacional + automação de processos',
        period: '2022 – Presente',
        bullets: [
          {
            ref: 'exp-4',
            text: 'Identifiquei oportunidades de melhoria contínua nos processos e implementei soluções com foco em usabilidade.',
          },
        ],
      },
    ],
    education: [
      {
        ref: 'ads-faculdade',
        course: 'Tecnólogo em Análise e Desenvolvimento de Sistemas (ADS)',
        institution: 'Faculdade Exemplo',
        detail: 'cursando — previsão Dez/2027',
      },
    ],
    certifications: [
      { ref: 'cert-react', name: 'React + Node.js', detail: 'Escola Exemplo · 60h' },
    ],
    languages: ['Português (Nativo)', 'Inglês (Intermediário — leitura técnica)'],
  };
}

async function setup(): Promise<{
  profile: Awaited<ReturnType<typeof loadProfile>>;
  bank: KeywordBank;
  cv: TailoredCv;
  errors: (cv: TailoredCv) => string;
  report: (cv: TailoredCv) => ReturnType<typeof validateCv>;
}> {
  const profile = await loadProfile(PROFILE);
  const bank = await loadKeywords(KEYWORDS);
  const cv = baseCv();
  const report = (target: TailoredCv) => validateCv(target, profile, '', bank);
  return { profile, bank, cv, errors: (target) => report(target).errors.join(' '), report };
}

describe('validador anti-alucinacao', () => {
  it('aprova um CV que so usa fatos do perfil', async () => {
    const { cv, report } = await setup();
    expect(report(cv).errors).toEqual([]);
  });

  it('rejeita numero que nao existe no perfil', async () => {
    const { cv, errors } = await setup();
    cv.summary += ' Aumentei a conversao em 42%.';
    expect(errors(cv)).toContain('42');
  });

  it('rejeita empresa diferente da cadastrada', async () => {
    const { cv, errors } = await setup();
    cv.experience[0]!.company = 'Globex Ltda';
    expect(errors(cv)).toContain('Globex');
  });

  it('rejeita periodo que nao contem o ano de inicio', async () => {
    const { cv, errors } = await setup();
    cv.experience[0]!.period = '2018 – Presente';
    expect(errors(cv)).toContain('2018');
  });

  it('rejeita skill inventada', async () => {
    const { cv, errors } = await setup();
    cv.skills[1]!.items.push('Angular');
    expect(errors(cv)).toContain('Angular');
  });

  it('aceita tecnologia em aprendizado apenas no grupo de aprendizado', async () => {
    const { cv, errors } = await setup();
    cv.skills.push({ group: 'Em aprendizado', items: ['Docker'] });
    expect(errors(cv)).toBe('');

    const wrong = structuredClone(cv);
    wrong.skills = wrong.skills.filter((group) => group.group !== 'Em aprendizado');
    wrong.skills.find((group) => group.group === 'Backend')!.items.push('Docker');
    expect(errors(wrong)).toContain('Docker');
  });

  it('rejeita bullet que nao pertence ao projeto referenciado', async () => {
    const { cv, errors } = await setup();
    cv.projects[0]!.bullets[0]!.ref = 'exp-1';
    expect(errors(cv)).toContain('exp-1');
  });

  it('rejeita link que nao e o repo/demo do projeto', async () => {
    const { cv, errors } = await setup();
    cv.projects[0]!.link = 'https://github.com/exemplo/outro-projeto';
    expect(errors(cv)).toContain('outro-projeto');
  });

  it('rejeita link em projeto que nao tem repo nem demo', async () => {
    const { cv, errors } = await setup();
    cv.projects.push({
      ref: 'landing-pages',
      name: 'Landing Pages',
      stack: ['React'],
      link: 'https://exemplo.com',
      bullets: [
        { ref: 'lp-1', text: 'Desenvolvi landing pages e sites institucionais com React e Next.js.' },
      ],
    });
    expect(errors(cv)).toContain('landing-pages');
  });

  it('rejeita placeholder no texto', async () => {
    const { cv, errors } = await setup();
    cv.summary += ' TODO revisar.';
    expect(errors(cv)).toContain('placeholder');
  });

  it('rejeita CV marcado como en com texto em portugues', async () => {
    const { cv, errors } = await setup();
    cv.meta.lang = 'en';
    cv.summary = 'Não tenho experiência com você, mas também estou aprendendo.';
    expect(errors(cv)).toContain('portugues');
  });

  it('rejeita projeto inexistente', async () => {
    const { cv, errors } = await setup();
    cv.projects[0]!.ref = 'projeto-fantasma';
    expect(errors(cv)).toContain('projeto-fantasma');
  });

  it('rejeita certificacao inexistente', async () => {
    const { cv, errors } = await setup();
    cv.certifications.push({ ref: 'cert-fake', name: 'Curso Inventado' });
    expect(errors(cv)).toContain('cert-fake');
  });
});

describe('cobertura de keywords', () => {
  it('calcula cobertura e lista ausentes para a vaga', async () => {
    const { profile, bank, cv } = await setup();
    const job = 'Vaga para React, TypeScript, Next.js, Jest e Scrum.';
    const report = validateCv(cv, profile, job, bank);
    expect(report.coverage).not.toBeNull();
    expect(report.coverage!.missing).toContain('Jest');
    expect(report.coverage!.score).toBeGreaterThan(0);
    expect(report.coverage!.score).toBeLessThan(100);
  });
});
