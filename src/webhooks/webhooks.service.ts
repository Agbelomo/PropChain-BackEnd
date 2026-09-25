// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CreateWebhookDto, UpdateWebhookDto, WebhookEventType } from './webhook.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly MAX_ATTEMPTS = 5;
  private readonly RETRY_DELAYS_MS = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 60s, 300s

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWebhookDto) {
    const secret = crypto.randomBytes(32).toString('hex');
    const webhook = await this.prisma.webhook.create({
      data: {
        userId,
        url: dto.url,
        secret,
        events: dto.eventTypes,
        description: dto.description,
      },
    });
    return { ...webhook, secret };
  }

  async findAll(userId: string) {
    return this.prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, userId },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');
    return webhook;
  }

  async update(id: string, userId: string, dto: UpdateWebhookDto) {
    await this.findOne(id, userId);
    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.url && { url: dto.url }),
        ...(dto.eventTypes && { events: dto.eventTypes }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && {
          status: dto.isActive ? 'ACTIVE' : 'INACTIVE',
        }),
      },
    });
  }

  async rotateSecret(id: string, userId: string) {
    const webhook = await this.findOne(id, userId);
    const newSecret = crypto.randomBytes(32).toString('hex');
    const updated = await this.prisma.webhook.update({
      where: { id: webhook.id },
      data: { secret: newSecret },
    });

    // Issue #1255 – Record secret rotation in audit log
    await this.prisma.activityLog
      .create({
        data: {
          userId,
          action: 'WEBHOOK_SECRET_ROTATED',
          entityType: 'WEBHOOK',
          entityId: id,
          description: `Rotated secret for webhook ${id}`,
          metadata: { webhookId: id, rotatedAt: new Date().toISOString() },
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to audit webhook secret rotation: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { ...updated, secret: newSecret };
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.webhook.delete({ where: { id } });
    return { deleted: true };
  }

  async trigger(eventType: string, payload: object) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        status: 'ACTIVE',
        events: { has: eventType },
      },
    });

    for (const webhook of webhooks) {
      await this.deliverWebhook(webhook, eventType, payload);
    }
  }

  async verifyChallenge(webhookId: string, userId: string, challenge: string) {
    const webhook = await this.findOne(webhookId, userId);
    try {
      const url = new URL(webhook.url);
      url.searchParams.set('challenge', challenge);
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (body.challenge === challenge) {
        await this.prisma.webhook.update({
          where: { id: webhookId },
          data: { status: 'ACTIVE' },
        });
        return { verified: true };
      }
    } catch (error) {
      this.logger.warn(
        `Webhook verification failed for ${webhookId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { verified: false };
  }

  async getDeliveries(webhookId: string, userId: string) {
    await this.findOne(webhookId, userId);
    return this.prisma.webhookDeliveryLog.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedDeliveries() {
    const now = new Date();
    const pendingRetries = await this.prisma.webhookDeliveryLog.findMany({
      where: {
        status: 'RETRYING',
        nextRetryAt: { lte: now },
        attempts: { lt: this.MAX_ATTEMPTS },
      },
      include: { webhook: true },
    });

    for (const delivery of pendingRetries) {
      if (!delivery.webhook || delivery.webhook.status !== 'ACTIVE') continue;
      await this.deliverWebhook(delivery.webhook, delivery.eventType, delivery.payload as object, delivery);
    }
  }

  /**
   * Prune old WebhookDeliveryLog rows older than retentionDays (Issue #1256).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneOldDeliveryLogs(retentionDays = 30) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.webhookDeliveryLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(
      `Pruned ${result.count} webhook delivery log(s) older than ${retentionDays} days`,
    );
    return result;
  }

  /**
   * Helper to compute retry delay using 0-based mapping (Issue #1256).
   */
  getRetryDelay(nextAttempt: number): number {
    const delayIndex = Math.min(
      Math.max(0, nextAttempt - 1),
      this.RETRY_DELAYS_MS.length - 1,
    );
    return this.RETRY_DELAYS_MS[delayIndex];
  }

  private async deliverWebhook(
    webhook: any,
    eventType: string,
    payload: object,
    existingDelivery?: any,
  ) {
    let delivery =
      existingDelivery ??
      (await this.prisma.webhookDeliveryLog.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload,
          status: 'PENDING',
          maxAttempts: this.MAX_ATTEMPTS,
        },
      }));

    const eventId =
      (payload as any)?.eventId || (payload as any)?.id || delivery.id;
    const idempotencyKey =
      (payload as any)?.id
        ? `${webhook.id}:${eventType}:${(payload as any).id}`
        : delivery.id;

    const body = JSON.stringify({
      event: eventType,
      eventId,
      payload,
      timestamp: new Date().toISOString(),
    });
    const signature = this.sign(body, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery-Id': delivery.id,
          'X-Webhook-Event-Id': eventId,
          'X-Webhook-Idempotency-Key': idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      const responseText = await response.text().catch(() => '');

      if (response.ok) {
        delivery = await this.prisma.webhookDeliveryLog.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCESS',
            responseCode: response.status,
            responseBody: responseText.substring(0, 2000),
            attempts: delivery.attempts + 1,
            deliveredAt: new Date(),
            nextRetryAt: null,
          },
        });
        this.logger.log(`Webhook delivered: ${eventType} to ${webhook.url}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 500)}`);
      }
    } catch (error) {
      const nextAttempt = delivery.attempts + 1;
      const shouldRetry = nextAttempt < this.MAX_ATTEMPTS;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Issue #1256 – 0-based retry backoff delay mapping
      const delayMs = this.getRetryDelay(nextAttempt);

      await this.prisma.webhookDeliveryLog.update({
        where: { id: delivery.id },
        data: {
          status: shouldRetry ? 'RETRYING' : 'FAILED',
          attempts: nextAttempt,
          error: errorMessage,
          responseBody: errorMessage.substring(0, 2000),
          nextRetryAt: shouldRetry ? new Date(Date.now() + delayMs) : null,
        },
      });

      this.logger.warn(
        `Webhook delivery failed: ${eventType} to ${webhook.url} (attempt ${nextAttempt}/${this.MAX_ATTEMPTS})`,
      );
    }
  }

  sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }
}
