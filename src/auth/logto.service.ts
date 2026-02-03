import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { UserInfo } from '../common/interfaces/user.interface';

@Injectable()
export class LogtoService {
  private readonly axiosInstance: AxiosInstance;
  private readonly logtoEndpoint: string;
  private readonly appId: string;
  private readonly appSecret: string;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('logto.endpoint');
    const appId = this.configService.get<string>('logto.appId');
    const appSecret = this.configService.get<string>('logto.appSecret');

    if (!endpoint) {
      throw new Error('LOGTO_ENDPOINT environment variable is required');
    }
    if (!appId) {
      throw new Error('LOGTO_APP_ID environment variable is required');
    }
    if (!appSecret) {
      throw new Error('LOGTO_APP_SECRET environment variable is required');
    }

    this.logtoEndpoint = endpoint;
    this.appId = appId;
    this.appSecret = appSecret;

    this.axiosInstance = axios.create({
      baseURL: this.logtoEndpoint,
      timeout: 10000,
    });
  }

  async validateToken(accessToken: string): Promise<UserInfo> {
    try {
      // First, introspect the token using M2M credentials
      const introspectionResponse = await this.axiosInstance.post(
        '/oidc/token/introspection',
        new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token',
        }),
        {
          auth: {
            username: this.appId,
            password: this.appSecret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const introspection = introspectionResponse.data;

      // Check if token is active
      if (!introspection.active) {
        throw new UnauthorizedException('Token is not active or has expired');
      }

      // Get user info using the validated token
      const userInfoResponse = await this.axiosInstance.get('/oidc/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userInfo = userInfoResponse.data;

      if (!userInfo.sub) {
        throw new UnauthorizedException('Invalid token: missing user ID');
      }

      // Logto returns organization_id in the token claims for multi-tenant setups
      const organizationId = userInfo.organization_id || userInfo.org_id;
      if (!organizationId) {
        throw new UnauthorizedException(
          'Invalid token: missing organization ID',
        );
      }

      return {
        userId: userInfo.sub,
        organizationId: organizationId,
        email: userInfo.email,
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to validate token');
    }
  }
}
