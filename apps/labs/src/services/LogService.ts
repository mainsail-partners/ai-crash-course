// Reusable logging utilities with optional post-log delay

const DEFAULT_DELAY_MS = Number(process.env.LOG_DELAY_MS ?? 750);

function timestamp(): string {
  return new Date().toISOString();
}

let LOG_SEQUENCE = 0;
function nextSequenceLabel(): string {
  LOG_SEQUENCE += 1;
  return String(LOG_SEQUENCE);
}

export function logSync(...args: Array<unknown>): void {
  console.log(`[${nextSequenceLabel()}]`, ...args);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LogOptions = {
  delayMs?: number;
};

/**
 * Prints a sequence-numbered log line and then waits for a short delay
 * so that sequential steps are easier to follow in the console.
 */
export async function log(
  message?: unknown,
  ...rest: Array<unknown | LogOptions>
): Promise<void> {
  // Detect an optional LogOptions object as the last arg
  let delayMs: number | undefined;
  if (rest.length > 0) {
    const last = rest[rest.length - 1] as LogOptions;
    if (last && typeof last === "object" && "delayMs" in last) {
      delayMs = last.delayMs;
      rest = rest.slice(0, -1);
    }
  }

  logSync(message, ...rest);
  const ms = typeof delayMs === "number" ? delayMs : DEFAULT_DELAY_MS;
  if (ms > 0) {
    await sleep(ms);
  }
}

export type SectionOptions = {
  width?: number;
  char?: string;
  delayMs?: number;
};

/**
 * Prints a simple banner-style section header with an optional delay after each line.
 */
export async function logSection(
  title: string,
  options?: SectionOptions
): Promise<void> {
  const width = Math.max(20, Math.min(120, options?.width ?? 60));
  const char = options?.char ?? "-";
  const delayMs = options?.delayMs;

  const trimmedTitle = String(title ?? "").trim();
  const visibleTitle =
    trimmedTitle.length > width ? trimmedTitle.slice(0, width) : trimmedTitle;

  const totalSpaces = Math.max(0, width - visibleTitle.length);
  const leftSpaces = Math.floor(totalSpaces / 2);
  const rightSpaces = totalSpaces - leftSpaces;

  const topBottom = char.repeat(width);
  const middle = `${" ".repeat(leftSpaces)}${visibleTitle}${" ".repeat(rightSpaces)}`;

  console.log(topBottom);
  console.log(middle);
  console.log(topBottom);
}
