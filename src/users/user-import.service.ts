import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { parse } from 'csv-parse/sync';
import { hashPassword } from '../auth/security.utils';
import { validatePassword } from '../auth/password.utils';
import { ActivityLogService } from './activity-log.service';
import { UserRole } from '../types/prisma.types';
import { Prisma } from '@prisma/client';

interface UserImportRecord {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
  phone?: string;
}

/**
 * Roles that regular ADMIN importers are allowed to provision from CSV.
 * Privileged roles (ADMIN, and any future super-admin/importer roles) are
 * deliberately excluded — see #1198. Use the documented super-admin flow for
 * provisioning admins.
 */
const ALLOWED_IMPORT_ROLES: readonly UserRole[] = [UserRole.USER, UserRole.AGENT];

@Injectable()
export class UserImportService {
  private readonly logger = new Logger(UserImportService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private activityLogService: ActivityLogService,
  ) {}

  async importFromCsv(buffer: Buffer, actorUser?: { id: string; email: string }) {
    let records: UserImportRecord[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error) {
      this.logger.error('Failed to parse CSV:', error);
      throw new BadRequestException(
        'Invalid CSV format: ' + (error instanceof Error ? error.message : String(error)),
      );
    }

    const report = {
      total: records.length,
      success: 0,
      failed: 0,
      errors: [] as { row: number; email: string; error: string }[],
    };

    if (records.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    const usersToCreate: Prisma.UserCreateInput[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + 2; // +1 for 0-indexed, +1 for header row
      const { email, firstName, lastName, password, role, phone } = record;

      try {
        // Validation
        if (!email || !firstName || !lastName || !password) {
          throw new Error('Missing required fields (email, firstName, lastName, password)');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error(`Invalid email format: ${email}`);
        }

        // #1199 – password policy: validate against the same PASSWORD_* config
        // used by registration, collecting every violation for this row.
        const passwordErrors = validatePassword(password, this.configService);
        if (passwordErrors.length > 0) {
          throw new Error(`Password does not meet policy: ${passwordErrors.join('; ')}`);
        }

        // #1198 – role whitelist: reject privileged/unknown roles per row instead
        // of silently coercing them.
        let normalizedRole: UserRole = UserRole.USER;
        if (role) {
          normalizedRole = role.toUpperCase() as UserRole;
          if (!ALLOWED_IMPORT_ROLES.includes(normalizedRole)) {
            throw new Error(
              `Role '${role}' is not importable from CSV. Allowed roles: ${ALLOWED_IMPORT_ROLES.join(
                ', ',
              )}`,
            );
          }
        }

        // Check for existing user in database
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
        });
        if (existingUser) {
          throw new Error('User with this email already exists');
        }

        // Check for duplicate in current CSV
        if (usersToCreate.some((u) => u.email === email)) {
          throw new Error('Duplicate email in CSV');
        }

        const hashedPassword = await hashPassword(password);

        // Generate unique referral code
        let referralCode: string;
        let isUnique = false;
        let attempts = 0;

        // Basic unique code generation
        do {
          referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          const existingCode = await this.prisma.user.findUnique({ where: { referralCode } });
          if (!existingCode) {
            isUnique = true;
          }
          attempts++;
        } while (!isUnique && attempts < 10);

        if (!isUnique) {
          throw new Error('Could not generate a unique referral code');
        }

        usersToCreate.push({
          email,
          firstName,
          lastName,
          password: hashedPassword,
          role: normalizedRole,
          phone: phone || null,
          referralCode,
          passwordHistory: {
            create: {
              passwordHash: hashedPassword,
            },
          },
        });
      } catch (error) {
        report.failed++;
        report.errors.push({
          row: rowNumber,
          email: email || 'N/A',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Bulk creation in a transaction
    if (usersToCreate.length > 0) {
      try {
        await this.prisma.$transaction(
          usersToCreate.map((userData) => this.prisma.user.create({ data: userData })),
        );
        report.success = usersToCreate.length;
      } catch (error) {
        this.logger.error('Bulk creation failed:', error);
        throw new BadRequestException('Bulk creation failed. Please check the CSV data.');
      }
    }

    // #1198 – audit the actor + import summary at the row level.
    await this.recordImportAudit(actorUser, report);

    return report;
  }

  private async recordImportAudit(
    actorUser?: { id: string; email: string },
    report?: {
      total: number;
      success: number;
      failed: number;
      errors: { row: number; email: string; error: string }[];
    },
  ): Promise<void> {
    if (!actorUser?.id) {
      this.logger.warn('User import completed without an actor; audit entry skipped');
      return;
    }

    const summary = report
      ? `total=${report.total}, success=${report.success}, failed=${report.failed}, rejectedRows=${report.errors.length}`
      : 'no report';

    try {
      await this.activityLogService.create(actorUser.id, {
        action: 'USER_IMPORT',
        entityType: 'USER',
        description: `CSV user import completed (${summary})`,
      });
    } catch (error) {
      // Audit must never fail the whole import.
      this.logger.error('Failed to write user-import audit entry', error as Error);
    }
  }
}