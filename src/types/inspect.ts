export type InspectCommand = "start" | "stop" | "restart" | "reload" | "delete" | "flush";

export interface StartIssue {
  field: string;
  message: string;
}

export interface RuntimeProfile {
  id: string;
  executableNames: string[];
  scriptExtensions: RegExp;
  supportsClusterMode: boolean;
  supportsInterpreterArgs: boolean;
}

export interface EntrypointConvention {
  matches: (script: string) => boolean;
  requiredRuntimeId?: string;
  requiresArgs?: boolean;
}
