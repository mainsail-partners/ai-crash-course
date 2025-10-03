// Week 2 — 01: Document Loading
// Purpose: Load a folder of mixed files (PDF, DOCX, TXT), normalize their
//          content and metadata into a consistent shape, and persist plain-text
//          outputs + a JSON index for later labs (chunking, embedding, retrieval).
//
// How to use:
// - Put a few files into apps/labs/week-2/documents
// - Run: npm run lab week-2/01-document-loading
// - Inspect outputs in apps/labs/week-2/output/01-document-loading
//
// Notes for learners:
// - We use LangChain community loaders for PDF/DOCX parsing.
// - We keep per-page granularity for PDFs to preserve source location.
// - The JSON index excludes raw content to keep it compact; text lives in /text.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import type { Document } from '@langchain/core/documents';

type LoadedDoc = {
  id: string;
  sourcePath: string;
  mimeType: string;
  page?: number;
  content: string;
  metadata: Record<string, unknown>;
};

/**
 * Normalize text for readability and consistency across loaders.
 * - Unify line endings to \n
 * - Trim trailing spaces on each line
 * - Collapse 3+ consecutive newlines into a maximum of 2 (single blank line)
 */
function normalizeContent(input: string): string {
  const unified = input.replace(/\r\n?/g, '\n');
  const trimmedLines = unified
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n');
  const collapsed = trimmedLines.replace(/\n{3,}/g, '\n\n');
  return collapsed.trim();
}

/** Create the directory if it does not exist (idempotent). */
function ensureDirSync(dir: string) {
  // Create the folder recursively if it doesn't exist yet
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Infer a MIME type from the file extension (best-effort, not exhaustive). */
function inferMimeType(filePath: string): string {
  // Look at the file extension to guess a reasonable MIME type
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.txt' || ext === '.md') return 'text/plain';
  return 'application/octet-stream';
}

/** Recursively yield file paths under a root directory. */
async function* walkFiles(rootDir: string): AsyncGenerator<string> {
  // List all entries (files and directories) in the current folder
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  for (const e of entries) {
    // Build the absolute path for this entry
    const p = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      // Recurse into subdirectories
      yield* walkFiles(p);
    } else if (e.isFile()) {
      // Yield file paths to the caller
      yield p;
    }
  }
}

/**
 * Load a single file using an appropriate loader and normalize the output
 * to an array of LoadedDoc objects. Some formats (e.g., PDF) produce multiple
 * logical docs (one per page) which we preserve.
 */
async function loadSingleFile(filePath: string): Promise<LoadedDoc[]> {
  // Determine type and extension upfront for branching
  const mimeType = inferMimeType(filePath);
  const ext = path.extname(filePath).toLowerCase();
  // Normalize to an array of documents with text content + metadata
  if (ext === '.pdf') {
    // PDF → one Document per page, include page number in id + metadata
    const loader = new PDFLoader(filePath, { parsedItemSeparator: '\n' });
    // Parse the file into LangChain Document objects
    const docs = await loader.load();
    return docs.map((d: Document, idx: number) => ({
      id: `${path.basename(filePath)}.p${(d.metadata as any)?.loc?.pageNumber ?? idx + 1}`,
      sourcePath: filePath,
      mimeType,
      page: (d.metadata as any)?.loc?.pageNumber ?? undefined,
      content: normalizeContent(d.pageContent),
      metadata: { ...d.metadata },
    }));
  }
  if (ext === '.docx') {
    // DOCX → extract main body text
    const loader = new DocxLoader(filePath);
    // Parse into one or more Document chunks
    const docs = await loader.load();
    return docs.map((d: Document, idx: number) => ({
      id: `${path.basename(filePath)}.${idx}`,
      sourcePath: filePath,
      mimeType,
      content: normalizeContent(d.pageContent),
      metadata: { ...d.metadata },
    }));
  }
  if (ext === '.txt' || ext === '.md') {
    // Plain text / Markdown → simple read
    // Read entire file content as UTF-8 text
    const content = await fsp.readFile(filePath, 'utf8');
    return [{
      id: `${path.basename(filePath)}.0`,
      sourcePath: filePath,
      mimeType,
      content: normalizeContent(content),
      metadata: {},
    }];
  }
  // Default: treat as UTF-8 text as a fallback
  // If parsing fails or the type is unknown, try reading it as text
  const fallback = await fsp.readFile(filePath, 'utf8').catch(() => '');
  return [{ id: path.basename(filePath), sourcePath: filePath, mimeType, content: normalizeContent(fallback), metadata: {} }];
}

/** Load and flatten all files under a directory; drop empty results. */
async function loadDirectory(inputDir: string): Promise<LoadedDoc[]> {
  // Accumulate normalized documents across all files
  const out: LoadedDoc[] = [];
  for await (const filePath of walkFiles(inputDir)) {
    // Load each file into one or more LoadedDoc entries
    const docs = await loadSingleFile(filePath);
    // Keep only non-empty text entries
    for (const d of docs) if (d.content && d.content.trim().length > 0) out.push(d);
  }
  return out;
}

/**
 * Persist results in two forms:
 * - text/: one .txt file per LoadedDoc for human inspection.
 * - index.json: only metadata (no content) for quick programmatic access.
 */
async function writeOutputs(outputDir: string, docs: LoadedDoc[]) {
  ensureDirSync(outputDir);
  const textDir = path.join(outputDir, 'text');
  ensureDirSync(textDir);

  const index = [] as Array<Omit<LoadedDoc, 'content'>>;
  for (const d of docs) {
    // Filesystem-safe name derived from id; includes page index for PDFs.
    const safeBase = d.id.replace(/[^a-zA-Z0-9\-_.]/g, '_').slice(0, 200);
    const outPath = path.join(textDir, `${safeBase}.txt`);
    // Write the plain-text content to an individual file for inspection
    await fsp.writeFile(outPath, d.content, 'utf8');
    // Append the document metadata (without content) to the JSON index
    const { content, ...meta } = d;
    index.push(meta);
  }
  // Persist the metadata index for quick lookup in later labs
  await fsp.writeFile(path.join(outputDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

export default async function main() {
  // Fixed input/output so no CLI args are needed for this lab
  const here = path.dirname(fileURLToPath(import.meta.url));
  const input = path.resolve(here, 'documents');
  const output = path.resolve(here, 'output/01-document-loading');

  console.log('Week-2 / 01-document-loading');
  console.log('Place documents (pdf, docx, txt) into: apps/labs/week-2/documents');
  console.log('Outputs will be written to: apps/labs/week-2/output/01-document-loading');

  // Ensure the input folder exists so learners can drop files in
  ensureDirSync(input);

  // Load and normalize all files under the input folder
  const docs = await loadDirectory(input);
  if (docs.length === 0) {
    // Early exit with guidance when no files are found
    console.log('No documents found in apps/labs/week-2/documents. Add files and re-run.');
    return;
  }
  console.log(`Loaded documents: ${docs.length}`);

  // Write text outputs and a compact metadata index for later labs
  await writeOutputs(output, docs);
  console.log('Wrote normalized text files and index.json');

  const preview = docs.slice(0, Math.min(3, docs.length));
  console.log('\nPreview:');
  for (const d of preview) {
    // Print a short snippet so readers can verify parsing worked
    const snippet = d.content.replace(/\s+/g, ' ').slice(0, 200);
    console.log(`- ${d.id} (${d.mimeType}) ← ${path.relative(process.cwd(), d.sourcePath)}\n  "${snippet}${d.content.length > 200 ? '…' : ''}"`);
  }
}


