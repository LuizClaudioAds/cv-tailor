import fs from 'node:fs/promises';
import path from 'node:path';
import type { TailoredCv } from './cv-schema.js';
import { paths } from './paths.js';
import type { Profile } from './profile.js';

const LABELS = {
  pt: {
    summary: 'Resumo',
    skills: 'Competências Técnicas',
    projects: 'Projetos',
    experience: 'Experiência Profissional',
    education: 'Formação Acadêmica',
    certifications: 'Certificações',
    languages: 'Idiomas',
    present: 'Presente',
  },
  en: {
    summary: 'Summary',
    skills: 'Technical Skills',
    projects: 'Projects',
    experience: 'Professional Experience',
    education: 'Education',
    certifications: 'Certifications',
    languages: 'Languages',
    present: 'Present',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactLine(identity: Profile['identity']): string {
  return [identity.location, identity.phone, identity.email].filter(Boolean).join(' · ');
}

function linkLine(profile: Profile): string[] {
  return Object.values(profile.identity.links).filter(Boolean);
}

export function renderMarkdown(cv: TailoredCv, profile: Profile): string {
  const labels = LABELS[cv.meta.lang];
  const lines: string[] = [];

  lines.push(`# ${profile.identity.name}`);
  lines.push(`**${cv.meta.headline}**`);
  lines.push(contactLine(profile.identity));
  if (linkLine(profile).length > 0) lines.push(linkLine(profile).join(' · '));
  lines.push('');

  lines.push(`## ${labels.summary}`);
  lines.push(cv.summary.trim());
  lines.push('');

  if (cv.skills.length > 0) {
    lines.push(`## ${labels.skills}`);
    for (const group of cv.skills) {
      lines.push(`- **${group.group}:** ${group.items.join(' · ')}`);
    }
    lines.push('');
  }

  if (cv.projects.length > 0) {
    lines.push(`## ${labels.projects}`);
    for (const project of cv.projects) {
      lines.push(`### ${project.name}`);
      if (project.stack.length > 0) lines.push(`*${project.stack.join(' · ')}*`);
      for (const bullet of project.bullets) lines.push(`- ${bullet.text.trim()}`);
      const link = project.link ?? '';
      if (link) lines.push(`[${link}](${link})`);
      lines.push('');
    }
  }

  if (cv.experience.length > 0) {
    lines.push(`## ${labels.experience}`);
    for (const item of cv.experience) {
      const title = item.context ? `${item.role} (${item.context})` : item.role;
      lines.push(`### ${title} — ${item.company}`);
      lines.push(`*${item.period}*`);
      for (const bullet of item.bullets) lines.push(`- ${bullet.text.trim()}`);
      lines.push('');
    }
  }

  if (cv.education.length > 0) {
    lines.push(`## ${labels.education}`);
    for (const item of cv.education) {
      const detail = item.detail ? ` (${item.detail})` : '';
      lines.push(`- **${item.course}** — ${item.institution}${detail}`);
    }
    lines.push('');
  }

  if (cv.certifications.length > 0) {
    lines.push(`## ${labels.certifications}`);
    for (const item of cv.certifications) {
      lines.push(`- ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
    }
    lines.push('');
  }

  if (cv.languages.length > 0) {
    lines.push(`## ${labels.languages}`);
    lines.push(cv.languages.join(' · '));
    lines.push('');
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function renderHtml(cv: TailoredCv, profile: Profile, template: string): string {
  const labels = LABELS[cv.meta.lang];
  const { identity } = profile;
  const parts: string[] = [];

  parts.push('<header>');
  parts.push(`<h1>${escapeHtml(identity.name)}</h1>`);
  parts.push(`<p class="headline">${escapeHtml(cv.meta.headline)}</p>`);
  parts.push(`<p class="contact">${escapeHtml(contactLine(profile.identity))}</p>`);
  const links = linkLine(profile);
  if (links.length > 0) {
    parts.push(`<p class="links">${links.map(escapeHtml).join(' · ')}</p>`);
  }
  parts.push('</header>');

  parts.push(`<section><h2>${labels.summary}</h2><p>${escapeHtml(cv.summary.trim())}</p></section>`);

  if (cv.skills.length > 0) {
    parts.push(`<section><h2>${labels.skills}</h2><ul class="skills">`);
    for (const group of cv.skills) {
      parts.push(
        `<li><strong>${escapeHtml(group.group)}:</strong> ${group.items.map(escapeHtml).join(' · ')}</li>`,
      );
    }
    parts.push('</ul></section>');
  }

  if (cv.projects.length > 0) {
    parts.push(`<section><h2>${labels.projects}</h2>`);
    for (const project of cv.projects) {
      parts.push('<div class="item">');
      parts.push(`<p class="item-head"><strong>${escapeHtml(project.name)}</strong></p>`);
      if (project.stack.length > 0) {
        parts.push(`<span class="stack">${escapeHtml(project.stack.join(' · '))}</span>`);
      }
      parts.push('<ul>');
      for (const bullet of project.bullets) parts.push(`<li>${escapeHtml(bullet.text.trim())}</li>`);
      parts.push('</ul>');
      if (project.link) parts.push(`<p class="link">${escapeHtml(project.link)}</p>`);
      parts.push('</div>');
    }
    parts.push('</section>');
  }

  if (cv.experience.length > 0) {
    parts.push(`<section><h2>${labels.experience}</h2>`);
    for (const item of cv.experience) {
      const title = item.context ? `${item.role} (${item.context})` : item.role;
      parts.push('<div class="item">');
      parts.push(
        `<p class="item-head"><strong>${escapeHtml(title)}</strong> <span class="meta">— ${escapeHtml(item.company)} | ${escapeHtml(item.period)}</span></p>`,
      );
      if (item.bullets.length > 0) {
        parts.push('<ul>');
        for (const bullet of item.bullets) parts.push(`<li>${escapeHtml(bullet.text.trim())}</li>`);
        parts.push('</ul>');
      }
      parts.push('</div>');
    }
    parts.push('</section>');
  }

  if (cv.education.length > 0) {
    parts.push(`<section><h2>${labels.education}</h2><ul>`);
    for (const item of cv.education) {
      const detail = item.detail ? ` (${escapeHtml(item.detail)})` : '';
      parts.push(
        `<li><strong>${escapeHtml(item.course)}</strong> — ${escapeHtml(item.institution)}${detail}</li>`,
      );
    }
    parts.push('</ul></section>');
  }

  if (cv.certifications.length > 0) {
    parts.push(`<section><h2>${labels.certifications}</h2><ul>`);
    for (const item of cv.certifications) {
      const detail = item.detail ? ` — ${escapeHtml(item.detail)}` : '';
      parts.push(`<li>${escapeHtml(item.name)}${detail}</li>`);
    }
    parts.push('</ul></section>');
  }

  if (cv.languages.length > 0) {
    parts.push(
      `<section><h2>${labels.languages}</h2><p>${escapeHtml(cv.languages.join(' · '))}</p></section>`,
    );
  }

  return template
    .replace('{{LANG}}', cv.meta.lang === 'en' ? 'en' : 'pt-BR')
    .replace('{{TITLE}}', escapeHtml(`${profile.identity.name} — ${cv.meta.headline}`))
    .replace('{{CONTENT}}', parts.join('\n    '));
}

export async function loadTemplate(): Promise<string> {
  return fs.readFile(path.join(paths.templates, 'cv.html'), 'utf8');
}
