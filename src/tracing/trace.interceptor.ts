import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  private getSampleRate(): number {
    const envVal = process.env.TRACE_SAMPLE_RATE;
    if (envVal !== undefined && envVal !== '') {
      const parsed = parseFloat(envVal);
      if (!isNaN(parsed)) {
        return Math.max(0, Math.min(1, parsed));
      }
    }
    return 1.0;
  }

  private getSlowThreshold(): number {
    const envVal = process.env.TRACE_SLOW_THRESHOLD_MS;
    if (envVal !== undefined && envVal !== '') {
      const parsed = parseInt(envVal, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return 1000;
  }

  private shouldSample(): boolean {
    const sampleRate = this.getSampleRate();
    if (sampleRate >= 1) return true;
    if (sampleRate <= 0) return false;
    return Math.random() < sampleRate;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const traceId = randomUUID();
    const startTime = Date.now();

    const className = context.getClass().name;
    const handlerName = context.getHandler().name;

    const isSampled = this.shouldSample();
    const slowThreshold = this.getSlowThreshold();

    request.headers['x-trace-id'] = traceId;
    request.traceId = traceId;

    if (isSampled) {
      this.logger.log(`[${traceId}] ${className}.${handlerName} - started`);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse();
          if (response && typeof response.setHeader === 'function') {
            response.setHeader('X-Trace-Id', traceId);
          }
          const isSlow = duration >= slowThreshold;
          if (isSampled || isSlow) {
            this.logger.log(`[${traceId}] ${className}.${handlerName} - completed (${duration}ms)`);
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `[${traceId}] ${className}.${handlerName} - failed (${duration}ms): ${error.message}`,
          );
        },
      }),
    );
  }
}
