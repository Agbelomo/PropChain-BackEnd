import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

/**
 * Checks whether an IPv4 address belongs to a private, loopback, link-local,
 * cloud-metadata, or reserved range.
 */
export function isPrivateOrBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IPv4 -> treat as blocked
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network / "this" host)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private-Use / RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / Carrier-Grade NAT / RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback / RFC 1122)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local / RFC 3927 & Cloud metadata e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private-Use / RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (Documentation / TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private-Use / RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (Documentation / TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (Documentation / TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast / RFC 5771) & 240.0.0.0/4 (Reserved / RFC 1112 / Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to a private, loopback, link-local,
 * IPv4-mapped, or reserved range.
 */
export function isPrivateOrBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback (::1) and Unspecified (::)
  if (
    normalized === '::1' ||
    normalized === '::' ||
    /^0*(:0*)*:0*1$/.test(normalized) ||
    /^0*(:0*)*$/.test(normalized)
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.substring(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrBlockedIPv4(v4Part);
    }
  }

  // Unique Local Address (fc00::/7 -> fc00:: to fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // Link-Local (fe80::/10 -> fe80:: to febf::)
  if (/^fe[89ab]/i.test(normalized)) {
    return true;
  }

  // Documentation / Discard (2001:db8::/32, 100::/64)
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('100:')) {
    return true;
  }

  return false;
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateOrBlockedIPv4(ip);
  } else if (version === 6) {
    return isPrivateOrBlockedIPv6(ip);
  }
  return true; // Not a valid IP -> block
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

/**
 * Validates a webhook URL against SSRF threats.
 * Rejects loopback, private, link-local, and cloud metadata addresses.
 * Enforces HTTPS in non-local environments.
 * Supports a developer allowlist via WEBHOOK_DEV_ALLOWLIST or WEBHOOK_ALLOWLIST.
 */
export async function validateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid webhook URL format');
  }

  // Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException(
      `Webhook URL protocol must be http: or https:, received ${parsed.protocol}`,
    );
  }

  const isLocalEnv =
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    !process.env.NODE_ENV;

  if (!isLocalEnv && parsed.protocol !== 'https:') {
    throw new BadRequestException(
      'Webhook URL must use HTTPS in production and staging environments',
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Allowlist check (only effective in dev / test environments)
  const allowlistEnv = process.env.WEBHOOK_DEV_ALLOWLIST ?? process.env.WEBHOOK_ALLOWLIST ?? '';
  const allowlist = allowlistEnv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (isLocalEnv && allowlist.includes(hostname)) {
    return;
  }

  // Known metadata / internal hostnames
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new BadRequestException(`Webhook URL host is not permitted: ${hostname}`);
  }

  // IP literal
  if (net.isIP(hostname)) {
    if (isLocalEnv && allowlist.includes(hostname)) {
      return;
    }
    if (isPrivateOrBlockedIp(hostname)) {
      throw new BadRequestException(
        `Webhook URL targets a private, internal, or cloud-metadata IP: ${hostname}`,
      );
    }
    return;
  }

  // DNS resolution
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new BadRequestException(`Unable to resolve webhook hostname: ${hostname}`);
    }

    for (const record of addresses) {
      if (isLocalEnv && allowlist.includes(record.address.toLowerCase())) {
        continue;
      }
      if (isPrivateOrBlockedIp(record.address)) {
        throw new BadRequestException(
          `Webhook hostname ${hostname} resolves to restricted IP: ${record.address}`,
        );
      }
    }
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(`DNS resolution failed for webhook host: ${hostname}`);
  }
}
