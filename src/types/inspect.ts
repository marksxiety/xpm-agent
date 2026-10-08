export type InspectCommand = "start" | "stop" | "restart" | "reload" | "delete" | "flush";

export interface StartIssue {
  field: string;
  message: string;
}

export interface RuntimeProfile {
  id: string;
  /** Groups interchangeable runtimes (node/bun) so script/interpreter matching is family-based. */
  family: string;
  executableNames: string[];
  scriptExtensions: RegExp;
  supportsInterpreterArgs: boolean;
}

export interface EntrypointConvention {
  matches: (script: string) => boolean;
  requiredRuntimeId?: string;
  requiresArgs?: boolean;
}
