import { describe, expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import { resolveServerIpv4 } from "../../utils/network";

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
    return { address, family: "IPv4", internal, netmask: "255.255.255.0", cidr: `${address}/24`, mac: "00:00:00:00:00:00" };
}

function ipv6(address: string): NetworkInterfaceInfo {
    return { address, family: "IPv6", internal: false, netmask: "", cidr: "", mac: "", scopeid: -1 };
}

describe("resolveServerIpv4", () => {
    test("returns the first non-internal IPv4 in deterministic address order", () => {
        const interfaces = {
            "Wi-Fi": [ipv4("192.168.1.10")],
            Ethernet: [ipv4("10.0.0.5")],
        };
        expect(resolveServerIpv4(interfaces)).toBe("10.0.0.5");
    });

    test("ignores internal and IPv6 addresses", () => {
        const interfaces = {
            lo: [ipv4("127.0.0.1", true)],
            wlan: [ipv6("fe80::1")],
        };
        expect(resolveServerIpv4(interfaces)).toBe("127.0.0.1");
    });

    test("falls back to loopback when no external IPv4 exists", () => {
        expect(resolveServerIpv4({})).toBe("127.0.0.1");
        expect(resolveServerIpv4({ lo: [ipv4("127.0.0.1", true)] })).toBe("127.0.0.1");
    });
});