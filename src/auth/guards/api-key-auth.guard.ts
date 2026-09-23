import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request.headers);

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    request.authUser = await this.authService.validateApiKey(apiKey);
    return true;
  }

  /**
   * Extract the API key from any of the supported transports (#1193):
   * `api-key` header (documented in Swagger/CORS), legacy `x-api-key` header,
   * or `Authorization: ApiKey <key>`.
   *
   * All three behave identically; a deterministic 401 is thrown when none is
   * present or the Authorization header uses an unsupported scheme.
   */
  private extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
    const apiKeyHeader = this.firstHeaderValue(headers['api-key']);
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    const xApiKeyHeader = this.firstHeaderValue(headers['x-api-key']);
    if (xApiKeyHeader) {
      return xApiKeyHeader;
    }

    const authorizationHeader = this.firstHeaderValue(headers['authorization']);
    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme === 'ApiKey' && token ? token : null;
  }

  private firstHeaderValue(value: string | string[] | undefined): string | null {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw && raw.trim() ? raw.trim() : null;
  }
}
