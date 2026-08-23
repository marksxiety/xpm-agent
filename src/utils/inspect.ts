import { win32 } from "node:path";
import type { Static } from "elysia";
import { StartPayload } from "../schemas/process";
import type { StartIssue, RuntimeProfile, EntrypointConvention, InspectCommand } from "../types/inspect"

type StartPayloadType = Static<typeof StartPayload>;

// ---------------------------------------------------------------------------
// Runtime profiles
//
// Each profile describes a language/runtime family: how to recognize it from
// either the interpreter executable or the script's file extension, and what
// PM2 features it supports. Adding a new runtime is a matter of adding an
// entry here — inspectStart() itself never references a specific language.
// ---------------------------------------------------------------------------
const RUNTIME_PROFILES: RuntimeProfile[] = [
  {
    id: "node",
    executableNames: ["node", "bun"],
    scriptExtensions: /\.(?:m?js|cjs|ts|tsx|jsx|mts|cts)$/i,
    supportsClusterMode: true,
    supportsInterpreterArgs: true,
  },
  {
    id: "php",
    executableNames: ["php"],
    scriptExtensions: /\.(?:php|phtml)$/i,
    supportsClusterMode: false,
    supportsInterpreterArgs: false,
  },
  {
    id: "python",
    executableNames: ["python", "python3", "py", "pythonw"],
    scriptExtensions: /\.pyw?$/i,
    supportsClusterMode: false,
    supportsInterpreterArgs: true, // e.g. -O, -u
  },
  {
    id: "go",
    executableNames: ["go"],
    scriptExtensions: /\.go$/i,
    supportsClusterMode: false,
    supportsInterpreterArgs: false,
  },
];


// ---------------------------------------------------------------------------
// Entrypoint conventions
//
// Framework-specific entrypoint rules (artisan, manage.py, ...) are not
// runtime checks — they're naming conventions tied to a runtime by id.
// Keeping this table separate from RUNTIME_PROFILES means language support
// and framework convention support can evolve independently.
// ---------------------------------------------------------------------------

const ENTRYPOINT_CONVENTIONS: EntrypointConvention[] = [
  {
    matches: (scriptPath) => scriptPath.split(/[\\/]/).pop() === "artisan",
    requiredRuntimeId: "php",
    requiresArgs: true,
  },
  {
    matches: (scriptPath) => scriptPath.split(/[\\/]/).pop() === "manage.py",
    requiredRuntimeId: "python",
    requiresArgs: true,
  },
];


export function inspectStart(options: StartPayloadType): StartIssue[] {
  const issues: StartIssue[] = [];
  const script = options.script ?? "";
  const interpreter = options.interpreter;

  if (options.name?.trim() === "") {
    issues.push({
      field: "name",
      message: "name is required and cannot be empty",
    });
  }

  if (script.trim() === "") {
    issues.push({
      field: "script",
      message: "script is required and cannot be empty",
    });
  }

  // win32 is deliberate: interpreters are Windows executable paths (e.g.
  // C:\...\node.exe) regardless of the OS running this check, so validation
  // must not vary by host platform.
  if (interpreter !== "none" && !win32.isAbsolute(interpreter)) {
    issues.push({
      field: "interpreter",
      message:
        "interpreter must be an absolute path to the executable (e.g. 'C:\\Program Files\\nodejs\\node.exe'), not a bare name like 'node' or 'py' — only 'none' is accepted as a bare value",
    });
  }

  const interpreterProfile =
    interpreter === "none"
      ? undefined
      : RUNTIME_PROFILES.find((profile) =>
        profile.executableNames.includes(
          (interpreter.split(/[\\/]/).pop() ?? interpreter).replace(/\.exe$/i, "").toLowerCase(),
        ),
      );
  const scriptProfile = RUNTIME_PROFILES.find((profile) => profile.scriptExtensions.test(script));

  if (scriptProfile && interpreterProfile && scriptProfile.id !== interpreterProfile.id) {
    issues.push({
      field: "interpreter",
      message: `script '${script}' looks like a ${scriptProfile.id} file — interpreter should be a ${scriptProfile.id} executable path`,
    });
  }

  if (options.interpreter_args !== undefined && !interpreterProfile?.supportsInterpreterArgs) {
    issues.push({
      field: "interpreter_args",
      message: `'interpreter_args' isn't supported by this interpreter${interpreterProfile ? ` (${interpreterProfile.id})` : ""
        }`,
    });
  }

  if (options.exec_mode === "cluster" && !interpreterProfile?.supportsClusterMode) {
    issues.push({
      field: "exec_mode",
      message: `cluster mode isn't supported by this interpreter${interpreterProfile ? ` (${interpreterProfile.id})` : ""
        } — use 'fork' instead`,
    });
  }

  if (
    (options.instances === "max" || (typeof options.instances === "number" && options.instances > 1)) &&
    options.exec_mode !== "cluster"
  ) {
    issues.push({
      field: "instances",
      message: "'instances' has no effect in fork mode — set exec_mode to 'cluster' if supported",
    });
  }

  for (const convention of ENTRYPOINT_CONVENTIONS) {
    if (!convention.matches(script)) continue;

    if (convention.requiredRuntimeId && interpreterProfile?.id !== convention.requiredRuntimeId) {
      issues.push({
        field: "interpreter",
        message: `script matches a known entrypoint convention — interpreter should be a ${convention.requiredRuntimeId} executable`,
      });
    }

    if (convention.requiresArgs && !options.args) {
      issues.push({
        field: "args",
        message: "this entrypoint requires a subcommand in 'args'",
      });
    }
  }

  return issues;
}

export function inspect(command: InspectCommand, input: StartPayloadType | unknown): StartIssue[] {
  switch (command) {
    case "start":
      return inspectStart(input as StartPayloadType);
    default:
      return [];
  }
}