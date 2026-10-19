import { test, expect } from "bun:test";
import {
  findListeningPids,
  parseTasklistImageName,
  formatPortInUseError,
} from "../src/port-check";

test("findListeningPids flags TCP/TCPV6 listeners on any interface and ignores non-listeners", () => {
  const netstatOutput = [
    "  TCP    0.0.0.0:9209           0.0.0.0:0              LISTENING       1234",
    "  TCP    127.0.0.1:9209         0.0.0.0:0              LISTENING       1234",
    "  TCP    [::]:9209              [::]:0                 LISTENING       5678",
    "  TCP    192.168.1.5:9209       10.0.0.9:52344         ESTABLISHED     1234",
    "  TCP    10.0.0.9:9209          10.0.0.9:59877         TIME_WAIT       0",
    "  TCP    0.0.0.0:9210           0.0.0.0:0              LISTENING       9999",
    "  TCP    0.0.0.0:19209          0.0.0.0:0              LISTENING       8888",
    "",
  ].join("\r\n");
  expect(findListeningPids(netstatOutput, 9209).sort((a, b) => a - b)).toEqual([1234, 5678]);
});

test("findListeningPids ignores UDP rows and malformed lines", () => {
  const netstatOutput = [
    "  UDP    0.0.0.0:9209           *:*                                    1234",
    "  TCP    0.0.0.0:9209",
  ].join("\r\n");
  expect(findListeningPids(netstatOutput, 9209)).toEqual([]);
});

test("parseTasklistImageName extracts the image name and tolerates 'no tasks' output", () => {
  expect(parseTasklistImageName('"node.exe","1234","Console","1","20,000 K"\r\n')).toBe("node.exe");
  expect(parseTasklistImageName("INFO: No tasks are running which match the specified criteria.\r\n")).toBeUndefined();
});

test("formatPortInUseError names the owning process when known", () => {
  expect(formatPortInUseError(9209)).toContain("port 9209 is already in use");
  expect(formatPortInUseError(9209, 1234, "node.exe")).toContain("PID 1234 (node.exe)");
  expect(formatPortInUseError(9209, 1234)).toContain("PID 1234");
});
