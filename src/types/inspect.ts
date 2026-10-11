export type InspectCommand = "start" | "stop" | "restart" | "reload" | "delete" | "flush";

export interface StartIssue {
  field: string;
  message: string;
}

export type FlagRule =
  | { kind: "exact"; flag: string }       // e.g. -u
  | { kind: "pattern"; pattern: RegExp }  // e.g. --max-old-space-size=\d+
  | { kind: "path"; flag: string };       // value must resolve inside cwd
