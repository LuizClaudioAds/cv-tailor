import path from 'node:path';
import { indexProfile, loadProfile, type Profile } from '../lib/profile.js';

export async function profileValidate(options: { file?: string } = {}): Promise<void> {
  const profile = await loadProfile(options.file ? path.resolve(options.file) : undefined);
  const index = indexProfile(profile);

  if (index.duplicateBulletIds.length > 0) {
    throw new Error(`IDs de bullet duplicados: ${index.duplicateBulletIds.join(', ')}`);
  }

  const totalBullets = index.bullets.size;
  const label = options.file ? options.file.replace(/\\/g, '/') : 'data/profile.yaml';
  console.log(`${label} OK`);
  console.log(`  bullets....: ${totalBullets}`);
  console.log(`  projetos...: ${profile.projects.length}`);
  console.log(`  empresas...: ${profile.experience.length}`);
  console.log(`  skills.....: ${profile.skills.reduce((sum, group) => sum + group.items.length, 0)}`);
  console.log(`  formacao...: ${profile.education.length}`);
}

export async function profileShow(options: { section?: string }): Promise<void> {
  const profile = await loadProfile();
  const section = options.section?.toLowerCase();

  const sections: Record<string, () => string> = {
    identidade: () => renderIdentity(profile),
    resumo: () => `RESUMO\n\n${profile.summary.pt}`,
    skills: () => renderSkills(profile),
    projetos: () => renderProjects(profile),
    experiencia: () => renderExperience(profile),
    formacao: () => renderEducation(profile),
    certificacoes: () => renderCertifications(profile),
  };

  if (section) {
    const render = sections[section];
    if (!render) {
      throw new Error(`Secao desconhecida: ${section}. Use: ${Object.keys(sections).join(', ')}.`);
    }
    console.log(render());
    return;
  }

  console.log(
    [
      renderIdentity(profile),
      `RESUMO\n\n${profile.summary.pt}`,
      renderSkills(profile),
      renderProjects(profile),
      renderExperience(profile),
      renderEducation(profile),
      renderCertifications(profile),
    ].join('\n\n'),
  );
}

function renderIdentity(profile: Profile): string {
  const { identity } = profile;
  const links = Object.entries(identity.links)
    .map(([, value]) => value)
    .join(' · ');
  return [
    identity.name.toUpperCase(),
    identity.headline,
    `${identity.location} · ${identity.phone} · ${identity.email}`,
    links,
  ].join('\n');
}

function renderSkills(profile: Profile): string {
  const lines = profile.skills.map((group) => `${group.group}: ${group.items.join(' | ')}`);
  const languages = profile.languages
    .map((language) => `${language.name} (${language.level})`)
    .join(' | ');
  return ['COMPETÊNCIAS TÉCNICAS', ...lines, `Idiomas: ${languages}`].join('\n');
}

function renderProjects(profile: Profile): string {
  const blocks = profile.projects.map((project) => {
    const stack = project.stack.length > 0 ? ` | ${project.stack.join(', ')}` : '';
    const bullets = project.bullets.map((bullet) => `  - [${bullet.id}] ${bullet.text}`).join('\n');
    return `${project.name}${stack}\n${bullets}`;
  });
  return ['PROJETOS', ...blocks].join('\n\n');
}

function renderExperience(profile: Profile): string {
  const blocks = profile.experience.map((item) => {
    const end = item.period.current ? 'Presente' : (item.period.end ?? '');
    const bullets = item.bullets.map((bullet) => `  - [${bullet.id}] ${bullet.text}`).join('\n');
    return `${item.role} | ${item.company} | ${item.period.start} – ${end}\n${bullets}`;
  });
  return ['EXPERIÊNCIA PROFISSIONAL', ...blocks].join('\n\n');
}

function renderEducation(profile: Profile): string {
  const lines = profile.education.map((item) => {
    const detail = item.expected_end ?? item.end ?? '';
    return `${item.course} — ${item.institution} (${item.status}${detail ? `, ${detail}` : ''})`;
  });
  return ['FORMAÇÃO ACADÊMICA', ...lines].join('\n');
}

function renderCertifications(profile: Profile): string {
  if (profile.certifications.length === 0) return '';
  const lines = profile.certifications.map((cert) =>
    cert.hours ? `${cert.name} — ${cert.issuer} · ${cert.hours}h` : `${cert.name} — ${cert.issuer}`,
  );
  return ['CERTIFICAÇÕES', ...lines].join('\n');
}
