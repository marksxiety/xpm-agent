import type { HostMetricsSource } from "../../src/host";

type HostOverrides = {
  cpu?: number;
  cores?: number;
  total?: number;
  used?: number;
  free?: number;
};

export function makeHost(overrides: HostOverrides = {}): HostMetricsSource {
  const total = overrides.total ?? 16_000;
  const used = overrides.used ?? 6_000;

  return {
    currentLoad: async () => ({ currentLoad: overrides.cpu ?? 12.5 }),
    mem: async () => ({
      total,
      used,
      free: overrides.free ?? total - used,
    }),
    cores: () => overrides.cores ?? 8,
  };
}
