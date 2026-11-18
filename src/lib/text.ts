/** Remove acentos, preservando o restante do texto. */
export function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Texto comparavel: minusculo, sem acento, espacos colapsados. */
export function normalize(value: string): string {
  return deaccent(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function slugify(value: string, maxLength = 60): string {
  const slug = normalize(value.replace(/\([^)]*\)/g, ' '))
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.slice(0, maxLength).replace(/-$/, '');
}

/** Datas de vaga/arquivo no formato AAAA-MM-DD. */
export function todayStamp(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Colapsa linhas em branco repetidas e normaliza quebras de linha. */
export function tidyText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}
