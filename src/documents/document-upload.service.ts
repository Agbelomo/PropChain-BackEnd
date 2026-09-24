import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { hasKnownSignature, matchesMagicBytes } from '../common/security/magic-bytes';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MIME_SIZE_LIMITS: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'image/avif': 10 * 1024 * 1024,
  'application/pdf': 25 * 1024 * 1024,
  'application/msword': 15 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 15 * 1024 * 1024,
};

const THREAT_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<applet[\s>]/i,
];

export interface UploadRequest {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface UploadMetadata {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sanitisedName: string;
  uploadedAt: string;
}

@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);

  validate(request: UploadRequest): void {
    if (!ALLOWED_MIME_TYPES.has(request.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${request.mimeType}`);
    }
    if (request.fileSizeBytes <= 0) {
      throw new BadRequestException('File size must be greater than zero');
    }
    const limit = MIME_SIZE_LIMITS[request.mimeType] ?? 10 * 1024 * 1024;
    if (request.fileSizeBytes > limit) {
      throw new BadRequestException(
        `File exceeds maximum allowed size of ${Math.round(limit / (1024 * 1024))} MB for ${request.mimeType}`,
      );
    }
    if (!request.fileName.trim()) {
      throw new BadRequestException('File name cannot be empty');
    }
  }

  prepareMetadata(request: UploadRequest): UploadMetadata {
    this.validate(request);
    const sanitisedName = this.sanitizeFilename(request.fileName);

    return {
      ...request,
      sanitisedName,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate file signature (magic bytes) against the expected MIME type.
   */
  validateMagicBytes(buffer: Buffer, expectedMime: string): boolean {
    return matchesMagicBytes(buffer, expectedMime);
  }

  /**
   * Content-sniff a buffer and reject a mismatched MIME type with a 400.
   * Rejects empty and truncated buffers; PDFs are additionally checked for a
   * trailing EOF marker so a polyglot with a valid header is still rejected.
   */
  assertValidContent(buffer: Buffer, expectedMime: string): void {
    if (!hasKnownSignature(expectedMime)) {
      throw new BadRequestException(
        `Rejected file with declared type ${expectedMime}: no content signature is registered`,
      );
    }
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException(
        `Rejected file with declared type ${expectedMime}: content is empty`,
      );
    }
    if (!matchesMagicBytes(buffer, expectedMime)) {
      throw new BadRequestException(
        `File content does not match declared type ${expectedMime}: magic bytes mismatch`,
      );
    }
  }

  /**
   * Enhanced filename sanitization with path traversal prevention.
   */
  sanitizeFilename(filename: string): string {
    let name = filename.trim();
    name = name.replace(/\0/g, '');
    name = name.replace(/\.\./g, '');
    name = name.replace(/[/\\]/g, '');
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    name = name.replace(/_{2,}/g, '_');
    name = name.replace(/^[._-]+/, '');
    if (!name || name.length === 0) {
      name = `upload_${Date.now()}`;
    }
    return name.toLowerCase();
  }

  /**
   * Validate file size against type-specific limits.
   */
  validateFileSize(buffer: Buffer, mimeType: string): void {
    const limit = MIME_SIZE_LIMITS[mimeType] ?? 10 * 1024 * 1024;
    if (buffer.length > limit) {
      throw new BadRequestException(
        `File size ${Math.round(buffer.length / (1024 * 1024))}MB exceeds limit of ${Math.round(limit / (1024 * 1024))}MB for ${mimeType}`,
      );
    }
  }

  /**
   * Basic malware/threat scan looking for embedded scripts and suspicious patterns.
   */
  scanForThreats(buffer: Buffer): { safe: boolean; reason?: string } {
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024 * 1024));
    for (const pattern of THREAT_PATTERNS) {
      if (pattern.test(content)) {
        this.logger.warn(`Threat pattern detected: ${pattern.source}`);
        return { safe: false, reason: `Potentially dangerous pattern detected: ${pattern.source}` };
      }
    }
    return { safe: true };
  }
}
