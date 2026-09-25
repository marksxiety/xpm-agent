import { beforeEach, describe, expect, mock, test } from "bun:test";

type ConnectCallback = (error?: Error | null) => void;
type ListCallback = (error?: Error | null, list?: unknown[]) => void;

const state = {
  connectCalls: 0,
  connectBehavior: "success" as "success" | "error" | "deferred",
  connectCallbacks: [] as ConnectCallback[],
  connectError: new Error("connect ECONNREFUSED 127.0.0.1:4444"),
  listCalls: 0,
  listBehavior: "success" as "success" | "never" | "duplicate",
  listCallbacks: [] as ListCallback[],
  listError: null as Error | null,
  listResult: [] as unknown[],
};

const mockPm2 = {
  connect(callback: ConnectCallback) {
    state.connectCalls += 1;
    if (state.connectBehavior === "success") {
      callback(null);
      return;
    }
    if (state.connectBehavior === "error") {
      callback(state.connectError);
      return;
    }
    state.connectCallbacks.push(callback);
  },
  list(callback: ListCallback) {
    state.listCalls += 1;
    if (state.listBehavior === "never") {
      state.listCallbacks.push(callback);
      return;
    }
    callback(state.listError, state.listResult);
    if (state.listBehavior === "duplicate") callback(new Error("duplicate operation callback"), state.listResult);
  },
};

mock.module("pm2", () => ({ default: mockPm2 }));

const { Pm2Connection, Pm2RpcTimeoutError } = await import("../../pm2/client");

function listOperation(callback: (error: Error | null, result?: unknown[]) => void) {
  mockPm2.list((error, list) => callback(error ?? null, list ?? []));
}

beforeEach(() => {
  state.connectCalls = 0;
  state.connectBehavior = "success";
  state.connectCallbacks = [];
  state.listCalls = 0;
  state.listBehavior = "success";
  state.listCallbacks = [];
  state.listError = null;
  state.listResult = [];
});

describe("Pm2Connection", () => {
  test("opens one connection shared by concurrent operations", async () => {
    state.connectBehavior = "deferred";
    const client = new Pm2Connection(500);

    const first = client.execute<unknown[]>(listOperation);
    const second = client.execute<unknown[]>(listOperation);

    expect(state.connectCalls).toBe(1);

    state.connectCallbacks.forEach((callback) => callback(null));

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(state.listCalls).toBe(2);
    expect(state.connectCalls).toBe(1);
  });

  test("ignores a duplicate connect callback", async () => {
    state.connectBehavior = "deferred";
    const client = new Pm2Connection(500);

    const result = client.execute<unknown[]>(listOperation);
    const [connectCallback] = state.connectCallbacks;
    connectCallback!(null);
    connectCallback!(new Error("duplicate connect callback"));

    await expect(result).resolves.toEqual([]);
    expect(state.connectCalls).toBe(1);
  });

  test("settles once when pm2 invokes an operation callback twice", async () => {
    state.listBehavior = "duplicate";
    state.listResult = [{ pm_id: 0, name: "xpm-agent" }];
    const client = new Pm2Connection(500);

    await expect(client.execute<unknown[]>(listOperation)).resolves.toEqual([{ pm_id: 0, name: "xpm-agent" }]);
  });

  test("rejects on connect failure and retries on the next operation", async () => {
    state.connectBehavior = "error";
    const client = new Pm2Connection(500);

    await expect(client.execute<unknown[]>(listOperation)).rejects.toThrow("connect ECONNREFUSED");
    expect(state.connectCalls).toBe(1);

    state.connectBehavior = "success";
    await expect(client.execute<unknown[]>(listOperation)).resolves.toEqual([]);
    expect(state.connectCalls).toBe(2);
  });

  test("rejects when an operation throws synchronously", async () => {
    const client = new Pm2Connection(500);

    await expect(
      client.execute<unknown[]>(() => {
        throw new Error("sync failure");
      }),
    ).rejects.toThrow("sync failure");
  });

  test("rejects with a timeout error and reconnects when pm2 never responds", async () => {
    state.listBehavior = "never";
    const client = new Pm2Connection(50);

    await expect(client.execute<unknown[]>(listOperation)).rejects.toBeInstanceOf(Pm2RpcTimeoutError);
    expect(state.connectCalls).toBe(1);

    state.listBehavior = "success";
    await expect(client.execute<unknown[]>(listOperation)).resolves.toEqual([]);
    expect(state.connectCalls).toBe(2);
  });

  test("times out when the connection handshake never completes", async () => {
    state.connectBehavior = "deferred";
    const client = new Pm2Connection(50);

    await expect(client.execute<unknown[]>(listOperation)).rejects.toBeInstanceOf(Pm2RpcTimeoutError);

    state.connectBehavior = "success";
    await expect(client.execute<unknown[]>(listOperation)).resolves.toEqual([]);
    expect(state.connectCalls).toBe(2);
  });
});
