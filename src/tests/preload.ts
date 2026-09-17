import { mock } from "bun:test";

mock.module("systeminformation", () => ({
  currentLoad: async () => ({ currentLoad: 12.5 }),
  mem: async () => ({ total: 1000, used: 600, free: 400 }),
}));
