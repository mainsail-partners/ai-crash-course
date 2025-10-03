import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Load environment variables from apps/labs/.env if present
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run lab <week>/<script> or <script> (defaults to week-1)');
  process.exit(1);
}

const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const normalized = arg.includes('/') ? arg : `week-1/${arg}`;
const scriptPath = path.resolve(baseDir, normalized.endsWith('.ts') ? normalized : `${normalized}.ts`);

// Graceful handling if the requested lab script doesn't exist
if (!fs.existsSync(scriptPath)) {
  console.error(`Lab not found: ${normalized}`);
  console.error(`Expected file: ${path.relative(process.cwd(), scriptPath)}`);
  const slashIndex = normalized.indexOf('/');
  const weekDir = slashIndex > -1 ? normalized.slice(0, slashIndex) : 'week-1';
  const listDir = path.resolve(baseDir, weekDir);
  try {
    const entries = fs.readdirSync(listDir, { withFileTypes: true });
    const labs = entries
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => e.name.replace(/\.(ts|js)$/i, ''))
      .sort();
    if (labs.length > 0) {
      console.error(`Available labs in ${weekDir}:`);
      for (const name of labs) {
        console.error(` - ${weekDir}/${name}`);
      }
    }
  } catch {
    // If directory listing fails, ignore and just exit
  }
  process.exit(0);
}

const run = async () => {
  // Convert Windows path to file:// URL for ESM compatibility
  const fileUrl = scriptPath.startsWith('file://')
    ? scriptPath
    : `file://${scriptPath.replace(/\\/g, '/')}`;

  const mod = await import(fileUrl);
  if (typeof (mod as any).default === 'function') {
    await (mod as any).default();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
