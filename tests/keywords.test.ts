import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeCoverage, hasKeyword, loadKeywords } from '../src/lib/keywords.js';

const KEYWORDS = path.resolve('data/keywords.example.yaml');

describe('match de keywords', () => {
  it('nao casa Java dentro de JavaScript', async () => {
    const bank = await loadKeywords(KEYWORDS);
    const js = bank.core.find((keyword) => keyword.term === 'JavaScript')!;
    expect(hasKeyword('Vaga com Java e Spring', js)).toBe(false);
    expect(hasKeyword('Vaga com JavaScript e TypeScript', js)).toBe(true);
  });

  it('reconhece aliases sem depender de acento ou caixa', async () => {
    const bank = await loadKeywords(KEYWORDS);
    const node = bank.core.find((keyword) => keyword.term === 'Node.js')!;
    expect(hasKeyword('experiência com NODEJS', node)).toBe(true);
    expect(hasKeyword('experiência com Node', node)).toBe(true);
    expect(hasKeyword('experiência com Node.js', node)).toBe(true);
  });

  it('nao casa pedaco de palavra', async () => {
    const bank = await loadKeywords(KEYWORDS);
    const react = bank.core.find((keyword) => keyword.term === 'React')!;
    expect(hasKeyword('trabalhei com preact', react)).toBe(false);
  });

  it('retorna 100 quando a vaga nao pede nenhuma keyword conhecida', async () => {
    const bank = await loadKeywords(KEYWORDS);
    const coverage = analyzeCoverage('Vaga para pasteleiro', 'React e Node.js', bank);
    expect(coverage.score).toBe(100);
    expect(coverage.missing).toEqual([]);
  });

  it('calcula percentual de cobertura', async () => {
    const bank = await loadKeywords(KEYWORDS);
    const coverage = analyzeCoverage(
      'Precisamos de React, TypeScript e Jest.',
      'Curriculo com React e TypeScript.',
      bank,
    );
    const requested = coverage.requested.map((hit) => hit.term);
    expect(requested).toContain('React');
    expect(requested).toContain('TypeScript');
    expect(coverage.missing).toContain('Jest');
    expect(coverage.score).toBeLessThan(100);
  });
});
