import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { EncryptionService } from '../common/encryption.service';
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
      baseURL: 'https://graph.facebook.com/v21.0',
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

    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
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

  async getPages(accessToken: string): Promise<Array<{ id: string; name: string }>> {
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
    try {
      const response = await this.axiosInstance.get(`/${pageId}`, {
        params: {
          access_token: userAccessToken,
          fields: 'access_token',
        },
      });

      return response.data.access_token;
    } catch (error) {
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
    // Get long-lived token
    const longLived = await this.getLongLivedToken(accessToken);
    const pageAccessToken = pageId
      ? await this.getPageAccessToken(longLived.accessToken, pageId)
      : longLived.accessToken;

    const encryptedAccessToken =
      this.encryptionService.encrypt(pageAccessToken);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + longLived.expiresIn);

    // Deactivate existing connections
    await this.facebookConnectionRepository.update(
      { logtoOrgId: userInfo.organizationId, isActive: true },
      { isActive: false },
    );

    const connection = this.facebookConnectionRepository.create({
      logtoOrgId: userInfo.organizationId,
      facebookUserId,
      encryptedAccessToken,
      tokenExpiresAt: expiresAt,
      pageId: pageId || undefined,
      isActive: true,
    });

    return await this.facebookConnectionRepository.save(connection);
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

  async disconnect(logtoOrgId: string): Promise<void> {
    const result = await this.facebookConnectionRepository.update(
      { logtoOrgId, isActive: true },
      { isActive: false },
    );

    if (result.affected === 0) {
      throw new NotFoundException('No active connection found for organization');
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
    const millisecondsUntilExpiry =
      expirationDate.getTime() - now.getTime();
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
}
