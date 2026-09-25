import pm2 from "pm2";

export const PM2_RPC_TIMEOUT_MS = 10_000;

export class Pm2RpcTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`PM2 RPC timed out after ${timeoutMs}ms`);
    this.name = "Pm2RpcTimeoutError";
  }
}

export type Pm2Callback<T> = (operationError: Error | null, result?: T) => void;
export type Pm2Operation<T> = (callback: Pm2Callback<T>) => void;

export class Pm2Connection {
  private pending: Promise<void> | null = null;

  constructor(private readonly timeoutMs: number = PM2_RPC_TIMEOUT_MS) {}

  execute<T>(operation: Pm2Operation<T>): Promise<T> {
    const connection = this.ensureConnected();

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const settle = (operationError: Error | null, result?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (operationError) reject(operationError);
        else resolve(result as T);
      };

      const timer = setTimeout(() => {
        if (this.pending === connection) this.pending = null;
        settle(new Pm2RpcTimeoutError(this.timeoutMs));
      }, this.timeoutMs);

      connection.then(
        () => {
          try {
            operation(settle);
          } catch (thrownError) {
            settle(thrownError instanceof Error ? thrownError : new Error(String(thrownError)));
          }
        },
        (connectionError: Error) => {
          if (this.pending === connection) this.pending = null;
          settle(connectionError);
        },
      );
    });
  }

  reset(): void {
    this.pending = null;
  }

  private ensureConnected(): Promise<void> {
    if (!this.pending) {
      this.pending = new Promise<void>((resolve, reject) => {
        let settled = false;
        pm2.connect((connectionError) => {
          if (settled) return;
          settled = true;
          if (connectionError) reject(connectionError);
          else resolve();
        });
      });
    }
    return this.pending;
  }
}

export const pm2Connection = new Pm2Connection();
