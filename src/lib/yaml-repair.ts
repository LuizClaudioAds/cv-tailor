function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnbalanced(value: string): boolean {
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/**
 * Conserta o estrago classico de YAML inline: uma virgula dentro de parenteses
 * divide o item em dois. `[Testes (Vitest, Playwright)]` vira
 * ["Testes (Vitest", "Playwright)"] e deve voltar a ser um item so.
 */
export function joinParenthesized(items: unknown[]): string[] {
  const result: string[] = [];
  for (const raw of items) {
    const item = String(raw).trim();
    if (item.length === 0) continue;
    const previous = result.at(-1);
    if (previous !== undefined && isUnbalanced(previous)) {
      result[result.length - 1] = `${previous}, ${item}`;
    } else {
      result.push(item);
    }
  }
  return result;
}

function repairGroups(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((group) =>
    isRecord(group) && Array.isArray(group.items)
      ? { ...group, items: joinParenthesized(group.items) }
      : group,
  );
}

/** Repara listas de skills do data/profile.yaml. */
export function repairProfileYaml(data: unknown): unknown {
  if (!isRecord(data)) return data;
  return { ...data, skills: repairGroups(data.skills) };
}

/** Repara skills e stacks do cv.yaml gerado pelo agente. */
export function repairCvYaml(data: unknown): unknown {
  if (!isRecord(data)) return data;

  const projects = Array.isArray(data.projects)
    ? data.projects.map((project) =>
        isRecord(project) && Array.isArray(project.stack)
          ? { ...project, stack: joinParenthesized(project.stack) }
          : project,
      )
    : data.projects;

  return { ...data, skills: repairGroups(data.skills), projects };
}
