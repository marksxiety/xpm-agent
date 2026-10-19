import fs from "node:fs";
import pm2 from "pm2";
import { ENV_FILE, parseConfig, type ExporterConfig } from "./config";
import { assertPortAvailable } from "./port-check";
import { createServer } from "./server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function main(): void {
  if (fs.existsSync(ENV_FILE)) {
    try {
      process.loadEnvFile(ENV_FILE);
    } catch (error) {
      console.error(
        `[xpm-exporter] failed to load ${ENV_FILE}: ${errorMessage(error)}`,
      );
      process.exit(2);
    }
  }

  let config: ExporterConfig;
  try {
    config = parseConfig(process.env);
  } catch (error) {
    console.error(`[xpm-exporter] ${errorMessage(error)}`);
    process.exit(2);
  }

  try {
    assertPortAvailable(config.port);
  } catch (error) {
    console.error(`[xpm-exporter] ${errorMessage(error)}`);
    process.exit(2);
  }

  const server = createServer({ pm2, timeoutMs: config.timeoutMs });

  server.on("error", (error) => {
    console.error(
      `[xpm-exporter] failed to bind ${config.host}:${config.port}: ${errorMessage(error)}`,
    );
    process.exit(2);
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[xpm-exporter] listening at http://${config.host}:${config.port}/metrics`,
    );
  });
}

if (require.main === module) {
  main();
}
