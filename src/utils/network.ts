import os from "node:os"

export function resolveServerIpv4(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string {
    const addresses = Object.values(interfaces)
        .flat()
        .filter((info): info is os.NetworkInterfaceInfo => Boolean(info))
        .filter((info) => info.family === "IPv4" && !info.internal)
        .map((info) => info.address)
        .sort()

    return addresses[0] ?? "127.0.0.1"
}

let cachedServerIpv4: string | undefined;

export function getServerIpv4(): string {
    cachedServerIpv4 ??= resolveServerIpv4(os.networkInterfaces());
    return cachedServerIpv4;
}