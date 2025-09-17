import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';

@Injectable()
export class PromptService {
  constructor() {
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
    Handlebars.registerHelper('json', (ctx: unknown) => JSON.stringify(ctx, null, 2));
  }

  private async resolvePromptPath(name: string): Promise<string> {
    const candidates = [
      // Preferred: when running in apps/api, resolve from source folder
      path.resolve(process.cwd(), `agents/${name}/prompt.md`),
      // When executing from repo root (process.cwd() === repo root)
      path.resolve(process.cwd(), `apps/api/agents/${name}/prompt.md`),
      // When built, try resolving relative to dist/services/
      path.resolve(__dirname, `../../agents/${name}/prompt.md`),
    ];

    for (const base of candidates) {
      try {
        const filePath = base.endsWith('.md') ? base : path.resolve(base, `${name}.md`);
        await fs.access(filePath);
        return filePath;
      } catch {
        // try next
      }
    }
    throw new Error(`Prompt not found for '${name}'. Checked: ${candidates.join(', ')}`);
  }

  async load(name: string): Promise<string> {
    const filePath = await this.resolvePromptPath(name);
    return fs.readFile(filePath, 'utf8');
  }

  async render(name: string, data: Record<string, unknown> = {}): Promise<{ template: string; rendered: string }> {
    const template = await this.load(name);
    const compiled = Handlebars.compile(template, { noEscape: true });
    const rendered = compiled(data);
    return { template, rendered };
  }
}


