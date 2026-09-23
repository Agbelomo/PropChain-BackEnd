import { Logger } from '@nestjs/common';
import Web3 from 'web3';

const logger = new Logger('EnvValidation');

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
const JWT_SECRET_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
const MIN_JWT_SECRET_LENGTH = 32;

const ZERO_ADDRESS = /^0x0+$/i;
const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate blockchain settings when BLOCKCHAIN_ENABLED=true (#1178).
 *
 * Fail fast at boot: recording jobs must not start against a zero or bogus
 * contract address, a placeholder RPC URL, or without a signing key.
 */
export function validateBlockchainEnvironment(): string[] {
  const errors: string[] = [];
  const isEnabled = (process.env.BLOCKCHAIN_ENABLED ?? 'true').toLowerCase() === 'true';

  if (!isEnabled) {
    return errors;
  }

  const contractAddress = (process.env.BLOCKCHAIN_CONTRACT_ADDRESS || '').trim();
  const rpcUrl = (process.env.BLOCKCHAIN_RPC_URL || '').trim();
  const privateKey = (process.env.BLOCKCHAIN_PRIVATE_KEY || '').trim();

  if (!contractAddress) {
    errors.push('BLOCKCHAIN_CONTRACT_ADDRESS is required when BLOCKCHAIN_ENABLED=true');
  } else if (ZERO_ADDRESS.test(contractAddress)) {
    errors.push(
      'BLOCKCHAIN_CONTRACT_ADDRESS must not be the zero address placeholder ' +
        '(0x0000…000) supplied by .env.example',
    );
  } else if (!ETHEREUM_ADDRESS_PATTERN.test(contractAddress)) {
    errors.push(`BLOCKCHAIN_CONTRACT_ADDRESS is not a valid Ethereum address: ${contractAddress}`);
  } else if (!Web3.utils.isAddress(contractAddress)) {
    errors.push(
      `BLOCKCHAIN_CONTRACT_ADDRESS fails checksum validation: ${contractAddress} ` +
        '(use a correct EIP-55 checksummed address)',
    );
  }

  if (!rpcUrl) {
    errors.push('BLOCKCHAIN_RPC_URL is required when BLOCKCHAIN_ENABLED=true');
  } else if (/placeholder|replace.?me|change.?me|YOUR_[A-Z_]+|\.infura\.io\/v3\/YOUR/i.test(rpcUrl)) {
    errors.push(`BLOCKCHAIN_RPC_URL appears to be the placeholder value: ${rpcUrl}`);
  } else {
    let parsed: URL;
    try {
      parsed = new URL(rpcUrl);
    } catch {
      parsed = null as unknown as URL;
    }
    if (!parsed || !['http:', 'https:', 'wss:', 'ws:'].includes(parsed.protocol)) {
      errors.push(`BLOCKCHAIN_RPC_URL is not a valid http(s)/ws(s) URL: ${rpcUrl}`);
    }
  }

  if (!privateKey) {
    errors.push('BLOCKCHAIN_PRIVATE_KEY is required when BLOCKCHAIN_ENABLED=true');
  } else if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    errors.push('BLOCKCHAIN_PRIVATE_KEY must be a 32-byte hex key (0x + 64 hex chars)');
  }

  return errors;
}

export function validateEnvironment(): void {
  const MISSING: string[] = [];
  const WEAK: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      MISSING.push(key);
    }
  }

  for (const key of JWT_SECRET_VARS) {
    const value = process.env[key];
    if (value && value.length < MIN_JWT_SECRET_LENGTH) {
      WEAK.push(`${key} (found ${value.length} chars, need at least ${MIN_JWT_SECRET_LENGTH})`);
    }
  }

  const blockchainErrors = validateBlockchainEnvironment();

  if (MISSING.length > 0 || WEAK.length > 0 || blockchainErrors.length > 0) {
    const sections: string[] = [];
    if (MISSING.length > 0) {
      sections.push(
        `Missing required environment variables:\n` + MISSING.map((k) => `    - ${k}`).join('\n'),
      );
    }
    if (WEAK.length > 0) {
      sections.push(
        `Environment variables below the minimum required length (256 bits / ${MIN_JWT_SECRET_LENGTH} chars):\n` +
          WEAK.map((k) => `    - ${k}`).join('\n'),
      );
    }
    if (blockchainErrors.length > 0) {
      sections.push(
        `Blockchain configuration errors:\n` + blockchainErrors.map((k) => `    - ${k}`).join('\n'),
      );
    }
    logger.error(
      `\n  Fatal:\n  ` +
        sections.join('\n\n  ') +
        `\n\n  Please set them in .env or .env.local before starting the application.\n`,
    );
    process.exit(1);
  }
}
