import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { EncryptionService } from '../common/encryption.service';
import { UpdateFacebookConnectionDto } from './dto/update-facebook-connection.dto';
import { LogtoService } from '../auth/logto.service';
import { UserInfo } from '../common/interfaces/user.interface';

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly facebookAppId: string;
  private readonly facebookAppSecret: string;
  private readonly redirectUri: string;
  private readonly tokenRefreshThresholdDays: number;
  private readonly axiosInstance: AxiosInstance;

  constructor(
    @InjectRepository(FacebookConnection)
    private facebookConnectionRepository: Repository<FacebookConnection>,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private logtoService: LogtoService,
  ) {
    const appId = this.configService.get<string>('facebook.appId');
    const appSecret = this.configService.get<string>('facebook.appSecret');
    const redirectUri = this.configService.get<string>('facebook.redirectUri');
    const tokenRefreshThresholdDays = this.configService.get<number>(
      'facebook.tokenRefreshThresholdDays',
    );

    if (!appId || !appSecret || !redirectUri) {
      throw new Error(
        'Facebook configuration is missing. Check FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI',
      );
    }

    this.facebookAppId = appId;
    this.facebookAppSecret = appSecret;
    this.redirectUri = redirectUri;
    this.tokenRefreshThresholdDays = tokenRefreshThresholdDays || 7;

    this.axiosInstance = axios.create({
      baseURL: 'https://graph.facebook.com/v20.0',
      timeout: 30000,
    });
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.facebookAppId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'pages_read_engagement,pages_read_user_content,pages_show_list',
      response_type: 'code',
    });

    return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
    userId: string;
  }> {
    try {
      const response = await this.axiosInstance.get('/oauth/access_token', {
        params: {
          client_id: this.facebookAppId,
          client_secret: this.facebookAppSecret,
          redirect_uri: this.redirectUri,
          code,
        },
      });

      const { access_token, expires_in } = response.data;

      // Get user ID
      const userResponse = await this.axiosInstance.get('/me', {
        params: {
          access_token,
          fields: 'id',
        },
      });

      return {
        accessToken: access_token,
        expiresIn: expires_in,
        userId: userResponse.data.id,
      };
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    try {
      const response = await this.axiosInstance.get('/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.facebookAppId,
          client_secret: this.facebookAppSecret,
          fb_exchange_token: shortLivedToken,
        },
      });

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      throw new Error(`Failed to get long-lived token: ${error.message}`);
    }
  }

  async getPages(
    accessToken: string,
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.axiosInstance.get('/me/accounts', {
        params: {
          access_token: accessToken,
          fields: 'id,name',
        },
      });

      return response.data.data || [];
    } catch (error) {
      throw new Error(`Failed to get pages: ${error.message}`);
    }
  }

  async getPageAccessToken(
    userAccessToken: string,
    pageId: string,
  ): Promise<string> {
    this.logger.log(`Getting page access token for pageId: ${pageId}`);
    try {
      const url = `/${pageId}`;
      this.logger.debug(`Requesting page access token from: ${url}`);

      const response = await this.axiosInstance.get(url, {
        params: {
          access_token: userAccessToken,
          fields: 'access_token',
        },
      });

      this.logger.debug(
        `Page access token response status: ${response.status}`,
      );

      if (!response.data?.access_token) {
        this.logger.error(
          `Page access token response missing access_token field. Response data: ${JSON.stringify(response.data)}`,
        );
        throw new Error('Page access token not found in response');
      }

      const pageAccessToken = response.data.access_token;
      this.logger.log(
        `Successfully retrieved page access token for pageId: ${pageId} (token length: ${pageAccessToken.length})`,
      );

      return pageAccessToken;
    } catch (error: any) {
      const errorMessage = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      const statusCode = error.response?.status;

      this.logger.error(
        `Failed to get page access token for pageId: ${pageId}. Status: ${statusCode}, Error: ${errorMessage}`,
      );

      throw new Error(`Failed to get page access token: ${error.message}`);
    }
  }

  async saveConnection(
    userInfo: UserInfo,
    facebookUserId: string,
    accessToken: string,
    expiresIn: number,
    pageId?: string,
  ): Promise<FacebookConnection> {
    this.logger.log(
      `Saving Facebook connection for userId: ${facebookUserId}, pageId: ${pageId || 'none'}, orgId: ${userInfo.organizationId}`,
    );

    // Get long-lived token
    this.logger.debug('Getting long-lived token');
    const longLived = await this.getLongLivedToken(accessToken);
    this.logger.debug(
      `Long-lived token obtained, expires in: ${longLived.expiresIn} seconds`,
    );

    const pageAccessToken = pageId
      ? await this.getPageAccessToken(longLived.accessToken, pageId)
      : longLived.accessToken;

    this.logger.debug(
      `Using ${pageId ? 'page' : 'user'} access token (length: ${pageAccessToken.length})`,
    );

    const encryptedAccessToken =
      this.encryptionService.encrypt(pageAccessToken);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + longLived.expiresIn);

    const connection = this.facebookConnectionRepository.create({
      logtoOrgId: userInfo.organizationId,
      facebookUserId,
      encryptedAccessToken,
      tokenExpiresAt: expiresAt,
      pageId: pageId || undefined,
      isActive: true,
    });

    const savedConnection =
      await this.facebookConnectionRepository.save(connection);
    this.logger.log(
      `Successfully saved Facebook connection with id: ${savedConnection.id}, pageId: ${savedConnection.pageId || 'none'}`,
    );

    return savedConnection;
  }

  async getConnectionStatus(
    logtoOrgId: string,
  ): Promise<{ connected: boolean; connection?: FacebookConnection }> {
    const connections = await this.facebookConnectionRepository.find({
      where: { logtoOrgId, isActive: true },
    });

    return {
      connected: connections.length > 0,
      connection: connections[0] || undefined,
    };
  }

  async getConnections(logtoOrgId: string): Promise<FacebookConnection[]> {
    return this.facebookConnectionRepository.find({
      where: { logtoOrgId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateConnectionName(
    connectionId: string,
    userId: string,
    dto: UpdateFacebookConnectionDto,
  ): Promise<FacebookConnection> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Facebook connection not found');
    }

    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const hasAccess = userOrgs.some(
      (org) => (org as { id: string }).id === connection.logtoOrgId,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to this Facebook connection',
      );
    }

    if (dto.name !== undefined) {
      connection.name = dto.name;
      await this.facebookConnectionRepository.save(connection);
    }

    return connection;
  }

  async deleteConnection(
    connectionId: string,
    logtoOrgId: string,
  ): Promise<void> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: { id: connectionId, logtoOrgId },
    });

    if (!connection) {
      throw new NotFoundException(
        'Facebook connection not found or does not belong to your organization',
      );
    }

    await this.facebookConnectionRepository.update(
      { id: connectionId },
      { isActive: false },
    );
  }

  async fetchPostsForConnectionByUser(
    connectionId: string,
    userId: string,
    since?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Facebook connection not found');
    }

    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const hasAccess = userOrgs.some(
      (org) => (org as { id: string }).id === connection.logtoOrgId,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to this Facebook connection',
      );
    }

    return this.fetchPostsForConnection(
      connectionId,
      connection.logtoOrgId,
      since,
    );
  }

  async fetchPostsForConnection(
    connectionId: string,
    logtoOrgId: string,
    since?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: { id: connectionId, logtoOrgId },
    });

    if (!connection) {
      throw new NotFoundException(
        'Facebook connection not found or does not belong to your organization',
      );
    }

    if (this.shouldRefreshToken(connection)) {
      try {
        await this.refreshConnectionToken(connection);
        const updatedConnection =
          await this.facebookConnectionRepository.findOne({
            where: { id: connection.id },
          });
        if (updatedConnection) {
          Object.assign(connection, updatedConnection);
        }
      } catch (refreshError: unknown) {
        const status = (refreshError as { response?: { status?: number } })
          ?.response?.status;
        if (status === 401 || status === 403) {
          throw refreshError;
        }
        this.logger.warn(
          `Token refresh failed for connection ${connection.id}, attempting fetch with existing token`,
        );
      }
    }

    const accessToken = await this.getDecryptedAccessToken(connection);
    const targetId = connection.pageId || connection.facebookUserId;
    const sinceTimestamp = since ?? Math.floor(Date.now() / 1000) - 86400; // Default: last 24 hours

    const endpoint = connection.pageId
      ? `/${targetId}/published_posts`
      : `/${targetId}/feed`;

    this.logger.log(
      `Fetching posts for connection ${connection.id}: targetId=${targetId}, endpoint=${endpoint}, since=${sinceTimestamp}`,
    );

    try {
      const response = await this.axiosInstance.get(endpoint, {
        params: {
          access_token: accessToken,
          fields: 'id,message,created_time',
          since: sinceTimestamp,
          limit: 100,
        },
      });

      return response.data.data || [];
    } catch (error: unknown) {
      const axiosError = error as {
        message?: string;
        response?: { status?: number; data?: unknown };
        config?: { url?: string; params?: Record<string, unknown> };
      };
      const status = axiosError.response?.status;
      const fbError = axiosError.response?.data as
        | { error?: { message?: string; code?: number; type?: string } }
        | undefined;
      const fbMessage = fbError?.error?.message ?? 'unknown';
      const fbCode = fbError?.error?.code;
      const fbType = fbError?.error?.type;
      const url = axiosError.config?.url;
      const params = axiosError.config?.params
        ? { ...axiosError.config.params, access_token: '[REDACTED]' }
        : undefined;

      this.logger.error(
        `Failed to fetch posts for connection ${connection.id}: ` +
          `status=${status ?? 'N/A'}, message=${axiosError.message ?? 'unknown'}, ` +
          `fbError=${fbMessage}, fbCode=${fbCode}, fbType=${fbType}, ` +
          `url=${url}, params=${JSON.stringify(params)}`,
      );

      throw new Error(
        `Failed to fetch posts: ${axiosError.message ?? 'unknown'}`,
      );
    }
  }

  async getDecryptedAccessToken(
    connection: FacebookConnection,
  ): Promise<string> {
    return this.encryptionService.decrypt(connection.encryptedAccessToken);
  }

  shouldRefreshToken(connection: FacebookConnection): boolean {
    // If no expiration date, assume token needs refresh to get proper expiration
    if (!connection.tokenExpiresAt) {
      this.logger.debug(
        `Connection ${connection.id} has no expiration date, will refresh`,
      );
      return true;
    }

    // Calculate days until expiration
    const now = new Date();
    const expirationDate = connection.tokenExpiresAt;
    const millisecondsUntilExpiry = expirationDate.getTime() - now.getTime();
    const daysUntilExpiry = millisecondsUntilExpiry / (1000 * 60 * 60 * 24);

    // Refresh if token expires within threshold or is already expired
    const needsRefresh = daysUntilExpiry <= this.tokenRefreshThresholdDays;

    if (needsRefresh) {
      this.logger.debug(
        `Connection ${connection.id} token expires in ${daysUntilExpiry.toFixed(1)} days, will refresh`,
      );
    }

    return needsRefresh;
  }

  async refreshConnectionToken(
    connection: FacebookConnection,
  ): Promise<FacebookConnection> {
    this.logger.log(
      `Refreshing token for connection ${connection.id} (Facebook User: ${connection.facebookUserId})`,
    );

    try {
      // Decrypt current token
      const currentToken = await this.getDecryptedAccessToken(connection);

      // Refresh to get new long-lived token (works for both short and long-lived tokens)
      const longLived = await this.getLongLivedToken(currentToken);

      this.logger.debug(
        `Successfully refreshed long-lived token for connection ${connection.id}, expires in ${longLived.expiresIn} seconds`,
      );

      // If this is a page connection, get the page access token
      let finalToken = longLived.accessToken;
      if (connection.pageId) {
        finalToken = await this.getPageAccessToken(
          longLived.accessToken,
          connection.pageId,
        );
        this.logger.debug(
          `Retrieved page access token for page ${connection.pageId}`,
        );
      }

      // Encrypt and save new token
      connection.encryptedAccessToken =
        this.encryptionService.encrypt(finalToken);

      // Update expiration date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + longLived.expiresIn);
      connection.tokenExpiresAt = expiresAt;

      // Save updated connection
      await this.facebookConnectionRepository.save(connection);

      this.logger.log(
        `Token refreshed successfully for connection ${connection.id}. New expiration: ${expiresAt.toISOString()}`,
      );

      return connection;
    } catch (error) {
      this.logger.error(
        `Failed to refresh token for connection ${connection.id}: ${error.message}`,
      );

      // If refresh fails with 401/403, token is invalid - mark as inactive
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.logger.warn(
          `Token refresh failed with ${error.response.status} for connection ${connection.id}, marking as inactive`,
        );
        connection.isActive = false;
        await this.facebookConnectionRepository.save(connection);
      }

      throw error;
    }
  }

  /**
   * Fetches attachments for a post. Uses same v20.0 as other calls to avoid
   * deprecate_post_aggregated_fields_for_attachement in v3.3+.
   */
  async fetchPostAttachments(
    postId: string,
    accessToken: string,
  ): Promise<{ data: unknown[] } | null> {
    try {
      const allAttachments: unknown[] = [];
      let nextUrl: string | null = null;

      do {
        const url = nextUrl || `/${postId}/attachments`;
        const params = nextUrl ? {} : { access_token: accessToken };

        const response = nextUrl
          ? await this.axiosInstance.get(nextUrl)
          : await this.axiosInstance.get(url, { params });

        const attachments = response.data.data || [];
        allAttachments.push(...attachments);
        nextUrl = response.data.paging?.next || null;
      } while (nextUrl);

      return allAttachments.length > 0 ? { data: allAttachments } : null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch attachments for post ${postId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async getSinglePostWithAttachments(
    connectionId: string,
    facebookPostId: string,
    userId: string,
  ): Promise<{
    post: Record<string, unknown>;
    attachments: { data: unknown[] } | null;
  }> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Facebook connection not found');
    }

    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const hasAccess = userOrgs.some(
      (org) => (org as { id: string }).id === connection.logtoOrgId,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to this Facebook connection',
      );
    }

    if (this.shouldRefreshToken(connection)) {
      try {
        await this.refreshConnectionToken(connection);
        const updated = await this.facebookConnectionRepository.findOne({
          where: { id: connection.id },
        });
        if (updated) Object.assign(connection, updated);
      } catch (refreshError: unknown) {
        const status = (refreshError as { response?: { status?: number } })
          ?.response?.status;
        if (status !== 401 && status !== 403) {
          this.logger.warn(
            `Token refresh failed for connection ${connection.id}, attempting fetch with existing token`,
          );
        } else {
          throw refreshError;
        }
      }
    }

    const accessToken = await this.getDecryptedAccessToken(connection);

    const response = await this.axiosInstance.get(`/${facebookPostId}`, {
      params: {
        access_token: accessToken,
        fields: 'id,message,created_time,permalink_url',
      },
    });

    const post = response.data as Record<string, unknown>;
    const attachments = await this.fetchPostAttachments(
      facebookPostId,
      accessToken,
    );

    return {
      post: {
        ...post,
        metadata: {
          permalinkUrl: post.permalink_url,
          attachments,
        },
      },
      attachments,
    };
  }
}
