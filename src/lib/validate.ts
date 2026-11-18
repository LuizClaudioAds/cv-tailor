import type { TailoredCv } from './cv-schema.js';
import { analyzeCoverage, type Coverage, type KeywordBank } from './keywords.js';
import { indexProfile, type Profile } from './profile.js';
import { normalize } from './text.js';

export interface Report {
  errors: string[];
  warnings: string[];
  coverage: Coverage | null;
}

const PLACEHOLDER = /\{\{|\}\}|\bTODO\b|\bTBD\b|lorem ipsum|<[a-z/][^>]*>/i;

/** Sequencias de digitos normalizadas ("5.000" -> "5000", "30–40" -> "30","40"). */
export function numberSet(values: string[]): Set<string> {
  const numbers = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/\d+(?:[.,]\d+)*/g)) {
      numbers.add(match[0].replace(/[.,]/g, ''));
    }
  }
  return numbers;
}

function allowedNumbers(profile: Profile): Set<string> {
  const texts: string[] = [
    profile.summary.pt,
    profile.summary.en ?? '',
    profile.development.practice_pt ?? '',
    profile.development.practice_en ?? '',
    ...profile.facts,
    ...profile.projects.flatMap((project) => project.bullets.map((bullet) => bullet.text)),
    ...profile.experience.flatMap((item) => [
      ...item.bullets.map((bullet) => bullet.text),
      item.period.start,
      item.period.end ?? '',
    ]),
    ...profile.education.flatMap((item) => [item.expected_end ?? '', item.end ?? '', item.course]),
    ...profile.certifications.map((cert) => `${cert.name} ${cert.hours ?? ''}`),
    ...profile.skills.flatMap((group) => group.items),
    ...profile.projects.map((project) => project.name),
  ];
  return numberSet(texts);
}

function containsEither(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return left.includes(right) || right.includes(left);
}

/** Chave comparavel para tecnologia: minuscula, sem acento/pontuacao, palavras ordenadas. */
export function canonicalSkill(value: string): string {
  return normalize(value.replace(/\([^)]*\)/g, ' '))
    .replace(/[^a-z0-9+#\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function validateCv(
  cv: TailoredCv,
  profile: Profile,
  jobText: string,
  bank: KeywordBank | null,
): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const index = indexProfile(profile);
  const allowed = allowedNumbers(profile);

  const allText = [
    cv.summary,
    ...cv.projects.flatMap((project) => [project.name, ...project.bullets.map((b) => b.text)]),
    ...cv.experience.flatMap((item) => [item.role, ...item.bullets.map((b) => b.text)]),
  ].join('\n');

  if (PLACEHOLDER.test(allText)) {
    errors.push('Texto contem placeholder ({{ }}, TODO, TBD ou HTML cru).');
  }

  // 1. Fatos: numeros citados precisam existir no profile.
  for (const number of numberSet([allText])) {
    if (!allowed.has(number)) {
      errors.push(`Numero "${number}" nao existe no curriculo base (possivel invencao).`);
    }
  }

  // 2. Projetos e bullets
  const projectIds = new Set(profile.projects.map((project) => project.id));
  for (const project of cv.projects) {
    if (!projectIds.has(project.ref)) {
      errors.push(`Projeto "${project.ref}" nao existe no profile.`);
      continue;
    }
    const source = profile.projects.find((item) => item.id === project.ref);
    if (!source) continue;
    const bulletIds = new Set(source.bullets.map((bullet) => bullet.id));
    for (const bullet of project.bullets) {
      if (!bulletIds.has(bullet.ref)) {
        errors.push(`Bullet "${bullet.ref}" nao pertence ao projeto "${project.ref}".`);
      }
    }
    if (project.link) {
      const allowedLinks = [source.repo, source.demo].filter(Boolean) as string[];
      const link = project.link.replace(/\/+$/, '');
      if (allowedLinks.length === 0) {
        errors.push(`Projeto "${project.ref}" nao tem repo/demo no profile; remova o link.`);
      } else if (!allowedLinks.some((value) => value.replace(/\/+$/, '') === link)) {
        errors.push(`Link "${project.link}" nao pertence ao projeto "${project.ref}" no profile.`);
      }
    }
  }

  // 3. Experiencias
  const experienceIds = new Set(profile.experience.map((item) => item.id));
  for (const item of cv.experience) {
    if (!experienceIds.has(item.ref)) {
      errors.push(`Experiencia "${item.ref}" nao existe no profile.`);
      continue;
    }
    const source = profile.experience.find((entry) => entry.id === item.ref);
    if (!source) continue;

    const bulletIds = new Set(source.bullets.map((bullet) => bullet.id));
    for (const bullet of item.bullets) {
      if (!bulletIds.has(bullet.ref)) {
        errors.push(`Bullet "${bullet.ref}" nao pertence a experiencia "${item.ref}".`);
      }
    }

    const companyOptions = [source.company, source.company_en ?? ''].filter(Boolean);
    if (!companyOptions.some((value) => containsEither(item.company, value))) {
      errors.push(
        `Empresa "${item.company}" nao corresponde a "${source.company}" (experiencia ${item.ref}).`,
      );
    }
    const roleOptions = [source.role, source.role_en ?? ''].filter(Boolean);
    if (!roleOptions.some((value) => containsEither(item.role, value))) {
      warnings.push(
        `Cargo "${item.role}" difere do cargo oficial "${source.role}" em ${item.ref}. ` +
          'Isso e aceitavel se o contexto foi preservado, mas confira antes de enviar.',
      );
    }
    if (!item.period.includes(source.period.start)) {
      errors.push(`Periodo "${item.period}" nao contem o ano de inicio ${source.period.start}.`);
    }
    if (source.period.end && !item.period.includes(source.period.end)) {
      errors.push(`Periodo "${item.period}" nao contem o ano de fim ${source.period.end}.`);
    }
  }

  // 4. Formacao e certificacoes
  const educationIds = new Set(profile.education.map((item) => item.id));
  for (const item of cv.education) {
    if (!educationIds.has(item.ref)) errors.push(`Formacao "${item.ref}" nao existe no profile.`);
  }
  const certIds = new Set(profile.certifications.map((cert) => cert.id));
  for (const item of cv.certifications) {
    if (!certIds.has(item.ref)) errors.push(`Certificacao "${item.ref}" nao existe no profile.`);
  }

  // 5. Skills e stacks: nao podem inventar tecnologia
  const expandSkill = (value: string): string[] => [
    value,
    ...value
      .replace(/\([^)]*\)/g, ' ')
      .split(/[,/·|]/)
      .map((part) => part.trim())
      .filter(Boolean),
  ];

  const isLearningGroup = (group: string) => /aprend|learning/i.test(group);

  const allowedSkills = new Set(
    [
      ...profile.skills
        .filter((group) => !isLearningGroup(group.group))
        .flatMap((group) => group.items),
      ...profile.projects.flatMap((project) => project.stack),
      ...profile.certifications.map((cert) => cert.name),
    ].flatMap((value) => expandSkill(value).map(canonicalSkill)),
  );
  const learning = new Set(
    [
      ...(bank
        ? bank.aprendendo.flatMap((keyword) => expandSkill(keyword.term))
        : []),
      ...profile.skills
        .filter((group) => isLearningGroup(group.group))
        .flatMap((group) => expandSkill(group.items.join(', '))),
    ].map(canonicalSkill),
  );

  const checkSkill = (item: string, where: string) => {
    if (expandSkill(item).some((candidate) => allowedSkills.has(canonicalSkill(candidate)))) return;
    if (expandSkill(item).some((candidate) => learning.has(canonicalSkill(candidate))) && isLearningGroup(where)) {
      return;
    }
    errors.push(`Skill "${item}" nao existe no curriculo base (${where}).`);
  };

  for (const group of cv.skills) {
    for (const item of group.items) checkSkill(item, group.group);
  }
  for (const project of cv.projects) {
    for (const item of project.stack) checkSkill(item, `stack de ${project.ref}`);
  }

  // 5. Headline coerente com o perfil
  const headlines = [
    profile.identity.headline,
    profile.identity.headline_en ?? '',
    ...profile.identity.headline_variants,
    ...profile.identity.headline_variants_en,
  ].filter(Boolean);
  if (!headlines.some((headline) => containsEither(cv.meta.headline, headline))) {
    warnings.push(
      `Headline "${cv.meta.headline}" nao esta entre as variantes do profile. ` +
        'Titulo alinhado a vaga ajuda o ATS, mas evite inflar senioridade.',
    );
  }

  // 6. Idioma
  if (cv.meta.lang === 'en') {
    const ptHits = allText.match(/\b(não|você|também|está|experiência|desenvolvimento|trabalho)\b/gi);
    if (ptHits && ptHits.length > 1) {
      errors.push('CV marcado como en, mas ha trechos em portugues.');
    }
  }

  // 7. Volume
  if (cv.summary.length > 900) warnings.push('Resumo longo (>900 caracteres); pode passar de 1 pagina.');
  const experienceBullets = cv.experience.reduce((sum, item) => sum + item.bullets.length, 0);
  if (experienceBullets > 12) warnings.push(`${experienceBullets} bullets de experiencia; ideal <= 12.`);
  if (cv.projects.length > 3) warnings.push(`${cv.projects.length} projetos; ideal <= 3 para 1 pagina.`);
  for (const project of cv.projects) {
    if (project.stack.length > 8) {
      warnings.push(`Stack de ${project.ref} tem ${project.stack.length} itens; o ideal e ate 8.`);
    }
  }

  const coverage = bank
    ? analyzeCoverage(jobText, [allText, ...cv.skills.flatMap((g) => [g.group, ...g.items]),
        ...cv.education.flatMap((item) => [item.course, item.institution, item.detail ?? '']),
        ...cv.certifications.flatMap((item) => [item.name, item.detail ?? '']),
        ...cv.languages,
      ].join('\n'), bank)
    : null;
  if (coverage && coverage.score < 60) {
    warnings.push(
      `Cobertura de keywords da vaga: ${coverage.score}%. Faltam: ${coverage.missing.slice(0, 8).join(', ')}.`,
    );
  }

  return { errors, warnings, coverage };
}
