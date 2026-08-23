export function classifyPm2Error(error: unknown): { status: number; message: string } {
  const rawMessage = error instanceof Error ? error.message : String((error as any)?.msg ?? error);
  const lowercasedMessage = rawMessage.toLowerCase();

  if (/process.*not found|process or namespace not found|app not found|no process found/.test(lowercasedMessage))
    return { status: 404, message: "Process not found" };
  if (/script not found/.test(lowercasedMessage))
    return { status: 400, message: "Script not found — check the 'script' path in your request" };
  if (/econnrefused|connect|etimedout|daemon/.test(lowercasedMessage))
    return { status: 503, message: "Cannot connect to PM2 daemon" };
  return { status: 500, message: `PM2 operation failed: ${rawMessage}` };
}

export function formatValidationMessage(message: string): string {
  try {
    const parsed = JSON.parse(message);
    return parsed.summary ?? message;
  } catch {
    return message;
  }
}
