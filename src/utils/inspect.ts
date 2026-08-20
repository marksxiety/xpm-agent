import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";

export interface StartIssue {
  field: string;
  message: string;
}

export type InspectCommand = "start" | "stop" | "restart" | "reload" | "delete" | "flush";

type StartPayloadType = Static<typeof StartPayload>;

const NODE_FAMILY = ["node", "bun"];
const NODE_EXTENSIONS = /\.(?:m?js|cjs|ts|tsx|jsx|mts|cts)$/i;
const PHP_EXTENSIONS = /\.(?:php|phtml)$/i;

function scriptBasename(script: string): string {
  return script.split(/[\\/]/).pop() ?? script;
}

function isArtisanScript(options: StartPayloadType): boolean {
  return scriptBasename(options.script ?? "") === "artisan";
}

function hasNodeExtension(script: string): boolean {
  return NODE_EXTENSIONS.test(script);
}

function hasPhpExtension(script: string): boolean {
  return PHP_EXTENSIONS.test(script);
}

function isNodeFamily(interpreter?: string): boolean {
  return interpreter === undefined || NODE_FAMILY.includes(interpreter);
}

function isPhp(interpreter?: string): boolean {
  return interpreter === "php";
}

function instancesGreaterThanOne(options: StartPayloadType): boolean {
  return options.instances === "max" || (typeof options.instances === "number" && options.instances > 1);
}

export function inspectStart(options: StartPayloadType): StartIssue[] {
  const issues: StartIssue[] = [];
  const script = options.script ?? "";
  const interpreter = options.interpreter;

  if (isArtisanScript(options) && interpreter !== undefined && interpreter !== "php") {
    issues.push({
      field: "interpreter",
      message: "script is an artisan binary — interpreter should be 'php'",
    });
  }

  if (isArtisanScript(options) && !options.args) {
    issues.push({
      field: "args",
      message: "artisan requires a subcommand in 'args', e.g. 'serve', 'schedule:work', 'queue:work'",
    });
  }

  if (hasPhpExtension(script) && !isPhp(interpreter)) {
    issues.push({
      field: "interpreter",
      message: `script '${script}' looks like a PHP file — interpreter should be 'php'`,
    });
  }

  if (hasNodeExtension(script) && interpreter !== undefined && !isNodeFamily(interpreter)) {
    issues.push({
      field: "interpreter",
      message: `script '${script}' looks like a Node file — interpreter should be 'node', 'bun', or 'none'`,
    });
  }

  if (options.interpreter_args !== undefined && !isNodeFamily(interpreter)) {
    issues.push({
      field: "interpreter_args",
      message: "'interpreter_args' only applies to node-family interpreters ('node', 'bun')",
    });
  }

  if (options.exec_mode === "cluster" && !isNodeFamily(interpreter)) {
    issues.push({
      field: "exec_mode",
      message: "cluster mode is Node-only — use 'fork' for other interpreters",
    });
  }

  if (instancesGreaterThanOne(options) && options.exec_mode !== "cluster") {
    issues.push({
      field: "instances",
      message: "'instances' has no effect in fork mode — set exec_mode to 'cluster' (Node only)",
    });
  }

  return issues;
}

export function inspect(command: "start", input: StartPayloadType): StartIssue[];
export function inspect(command: Exclude<InspectCommand, "start">, input: unknown): StartIssue[];
export function inspect(command: InspectCommand, input: StartPayloadType | unknown): StartIssue[] {
  switch (command) {
    case "start":
      return inspectStart(input as StartPayloadType);
    default:
      return [];
  }
}
