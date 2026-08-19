export function classifyPm2Error(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String((err as any)?.msg ?? err);
  const text = raw.toLowerCase();

  if (/process.*not found|process or namespace not found|app not found|no process found/.test(text))
    return { status: 404, message: "Process not found" };
  if (/script not found/.test(text))
    return { status: 400, message: "Script not found — check the 'script' path in your request" };
  if (/econnrefused|connect|etimedout|daemon/.test(text))
    return { status: 503, message: "Cannot connect to PM2 daemon" };
  return { status: 500, message: `PM2 operation failed: ${raw}` };
}

export function formatValidationMessage(message: string): string {
  try {
    const parsed = JSON.parse(message);
    return parsed.summary ?? message;
  } catch {
    return message;
  }
}
