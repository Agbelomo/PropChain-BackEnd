import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

export interface WebhookJobData {
  deliveryId?: string;
  webhookId: string;
  eventType: string;
  payload: object;
}

@Processor('webhook-delivery')
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<WebhookJobData, void, string>): Promise<void> {
    const { deliveryId, webhookId, eventType, payload } = job.data;
    this.logger.log(
      `Processing webhook delivery job ${job.id} for webhook ${webhookId} (event: ${eventType})`,
    );

    try {
      await this.webhooksService.processDeliveryJob(deliveryId, webhookId, eventType, payload);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to process webhook delivery job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error; // BullMQ handles retry with backoff
    }
  }
}
