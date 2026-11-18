import { hasKeyword, loadKeywords, TIERS, type KeywordBank, type Tier } from '../lib/keywords.js';
import { loadProfile } from '../lib/profile.js';
import { readJobSource } from '../lib/job-input.js';

const TIER_LABEL: Record<Tier, string> = {
  core: 'CORE (sempre usar)',
  fortes: 'FORTES (usar se a vaga citar)',
  aprendendo: 'EM APRENDIZADO (nunca como dominio)',
  pendente: 'PENDENTE (confirmar antes de usar)',
  soft: 'SOFT (com evidencia no CV)',
};

export async function keywordsCommand(options: { job?: string }): Promise<void> {
  const bank = await loadKeywords();

  if (!options.job) {
    printBank(bank);
    console.log('');
    console.log(
      'Use "cvtailor keywords --job <arquivo|url>" para ver o que a vaga pede e o que falta no perfil.',
    );
    return;
  }

  const profile = await loadProfile();
  const job = await readJobSource(options.job);
  const corpus = profileCorpus(profile);

  let requested = 0;
  let covered = 0;
  const missing: string[] = [];

  console.log(`Vaga: ${job.origin}`);
  console.log('');

  for (const tier of TIERS) {
    if (tier === 'pendente') continue;
    const hits = bank[tier].filter((keyword) => hasKeyword(job.text, keyword));
    if (hits.length === 0) continue;

    console.log(`${TIER_LABEL[tier]}`);
    for (const keyword of hits) {
      requested += 1;
      const present = hasKeyword(corpus, keyword);
      if (present) covered += 1;
      else missing.push(keyword.term);
      console.log(`  [${present ? 'x' : ' '}] ${keyword.term}`);
    }
    console.log('');
  }

  const pending = bank.pendente.filter((keyword) => hasKeyword(job.text, keyword));
  if (pending.length > 0) {
    console.log('PENDENTE — a vaga pede, mas falta confirmar:');
    for (const keyword of pending) console.log(`  ? ${keyword.term} — ${keyword.pergunta ?? ''}`);
    console.log('');
  }

  if (requested === 0) {
    console.log('Nenhuma keyword conhecida encontrada na vaga. O banco precisa de ajuste.');
    return;
  }

  const score = Math.round((covered / requested) * 100);
  console.log(`Cobertura do perfil: ${covered}/${requested} (${score}%)`);
  if (missing.length > 0) console.log(`Faltam no perfil: ${missing.join(', ')}`);
}

function profileCorpus(profile: Awaited<ReturnType<typeof loadProfile>>): string {
  return [
    profile.summary.pt,
    profile.summary.en ?? '',
    profile.development.practice_pt ?? '',
    ...profile.skills.flatMap((group) => group.items),
    ...profile.projects.flatMap((project) => [
      project.name,
      ...project.stack,
      ...project.bullets.map((b) => b.text),
    ]),
    ...profile.experience.flatMap((item) => [item.role, ...item.bullets.map((b) => b.text)]),
    ...profile.certifications.map((cert) => cert.name),
  ].join('\n');
}

function printBank(bank: KeywordBank): void {
  for (const tier of TIERS) {
    const keywords = bank[tier];
    if (keywords.length === 0) continue;
    console.log(`${TIER_LABEL[tier]} — ${keywords.length}`);
    for (const keyword of keywords) {
      const aliases = keyword.aliases.length > 0 ? ` (${keyword.aliases.join(', ')})` : '';
      console.log(`  - ${keyword.term}${aliases}`);
    }
    console.log('');
  }
}
