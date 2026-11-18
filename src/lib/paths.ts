import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

/** Raiz do projeto (src/lib -> raiz). */
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const paths = {
  root: projectRoot,
  data: path.join(projectRoot, 'data'),
  base: path.join(projectRoot, 'data', 'base'),
  profile: path.join(projectRoot, 'data', 'profile.yaml'),
  preferences: path.join(projectRoot, 'data', 'preferences.yaml'),
  prompts: path.join(projectRoot, 'prompts'),
  templates: path.join(projectRoot, 'templates'),
  jobs: path.join(projectRoot, 'jobs'),
  jobDir: (slug: string) => path.join(projectRoot, 'jobs', slug),
};

export function ensureDirs(): void {
  for (const dir of [paths.data, paths.base, paths.prompts, paths.templates, paths.jobs]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function rel(absPath: string): string {
  return path.relative(projectRoot, absPath).split(path.sep).join('/');
}
