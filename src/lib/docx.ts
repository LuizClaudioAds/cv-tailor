import fs from 'node:fs/promises';
import type { Paragraph as ParagraphType } from 'docx';
import type { TailoredCv } from './cv-schema.js';
import type { Profile } from './profile.js';

const LABELS = {
  pt: {
    summary: 'RESUMO',
    skills: 'COMPETÊNCIAS TÉCNICAS',
    projects: 'PROJETOS',
    experience: 'EXPERIÊNCIA PROFISSIONAL',
    education: 'FORMAÇÃO ACADÊMICA',
    certifications: 'CERTIFICAÇÕES',
    languages: 'IDIOMAS',
  },
  en: {
    summary: 'SUMMARY',
    skills: 'TECHNICAL SKILLS',
    projects: 'PROJECTS',
    experience: 'PROFESSIONAL EXPERIENCE',
    education: 'EDUCATION',
    certifications: 'CERTIFICATIONS',
    languages: 'LANGUAGES',
  },
} as const;

export async function writeDocx(cv: TailoredCv, profile: Profile, outputPath: string): Promise<void> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = await import('docx');

  const labels = LABELS[cv.meta.lang];
  const { identity } = profile;

  const sectionTitle = (text: string) =>    new Paragraph({
      spacing: { before: 220, after: 90 },
      border: { bottom: { color: '1F3B57', style: BorderStyle.SINGLE, size: 6, space: 1 } },
      children: [
        new TextRun({ text, bold: true, size: 21, color: '1F3B57', allCaps: false }),
      ],
    });

  const bullet = (text: string) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 50 },
      children: [new TextRun({ text: text.trim(), size: 20 })],
    });

  const children: ParagraphType[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 0 },
      children: [new TextRun({ text: identity.name.toUpperCase(), bold: true, size: 36 })],
    }),
  );
  children.push(
    new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: cv.meta.headline, bold: true, size: 21, color: '1F3B57' })],
    }),
  );
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: [identity.location, identity.phone, identity.email].filter(Boolean).join('  |  '),
          size: 17,
        }),
      ],
    }),
  );
  const links = Object.values(identity.links).filter(Boolean);
  if (links.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: links.join('  |  '), size: 17, color: '1F3B57' })],
      }),
    );
  }

  children.push(sectionTitle(labels.summary));
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: cv.summary.trim(), size: 20 })],
    }),
  );

  if (cv.skills.length > 0) {
    children.push(sectionTitle(labels.skills));
    for (const group of cv.skills) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${group.group}: `, bold: true, size: 20 }),
            new TextRun({ text: group.items.join(' | '), size: 20 }),
          ],
        }),
      );
    }
  }

  if (cv.projects.length > 0) {
    children.push(sectionTitle(labels.projects));
    for (const project of cv.projects) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 0 },
          children: [new TextRun({ text: project.name, bold: true, size: 21 })],
        }),
      );
      if (project.stack.length > 0) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: project.stack.join(' | '), italics: true, size: 18, color: '444444' }),
            ],
          }),
        );
      }
      for (const item of project.bullets) children.push(bullet(item.text));
      if (project.link) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: project.link, size: 17, color: '1F3B57' })],
          }),
        );
      }
    }
  }

  if (cv.experience.length > 0) {
    children.push(sectionTitle(labels.experience));
    for (const item of cv.experience) {
      const title = item.context ? `${item.role} (${item.context})` : item.role;
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 0 },
          children: [
            new TextRun({ text: title, bold: true, size: 21 }),
            new TextRun({ text: ` — ${item.company} | ${item.period}`, size: 19, color: '333333' }),
          ],
        }),
      );
      for (const entry of item.bullets) children.push(bullet(entry.text));
    }
  }

  if (cv.education.length > 0) {
    children.push(sectionTitle(labels.education));
    for (const item of cv.education) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${item.course} — ${item.institution}`, size: 20 }),
            ...(item.detail ? [new TextRun({ text: ` (${item.detail})`, size: 19 })] : []),
          ],
        }),
      );
    }
  }

  if (cv.certifications.length > 0) {
    children.push(sectionTitle(labels.certifications));
    for (const item of cv.certifications) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: item.name, size: 20 }),
            ...(item.detail ? [new TextRun({ text: ` — ${item.detail}`, size: 19 })] : []),
          ],
        }),
      );
    }
  }

  if (cv.languages.length > 0) {
    children.push(sectionTitle(labels.languages));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: cv.languages.join(' | '), size: 20 })],
      }),
    );
  }

  const doc = new Document({
    creator: identity.name,
    title: `${identity.name} — ${cv.meta.headline}`,
    description: `Curriculo adaptado para ${cv.meta.role} @ ${cv.meta.company}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 850, bottom: 850, left: 900, right: 900 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
}
