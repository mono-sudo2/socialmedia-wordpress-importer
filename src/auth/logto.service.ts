import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { UserInfo } from '../common/interfaces/user.interface';

interface M2MTokenCache {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class LogtoService {
  private readonly axiosInstance: AxiosInstance;
  private readonly logtoEndpoint: string;
  private readonly appId: string;
  private readonly appSecret: string;
  private m2mTokenCache: M2MTokenCache | null = null;

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

  async getM2MAccessToken(): Promise<string> {
    const now = Date.now();
    const bufferSeconds = 60;
    if (
      this.m2mTokenCache &&
      this.m2mTokenCache.expiresAt > now + bufferSeconds * 1000
    ) {
      return this.m2mTokenCache.accessToken;
    }

    const resource = `${this.logtoEndpoint.replace(/\/$/, '')}/api`;
    const tokenResponse = await this.axiosInstance.post(
      '/oidc/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.appId,
        client_secret: this.appSecret,
        resource,
        scope: 'all',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, expires_in } = tokenResponse.data;
    this.m2mTokenCache = {
      accessToken: access_token,
      expiresAt: now + expires_in * 1000,
    };
    return access_token;
  }

  async createOrganization(data: {
    name: string;
    description?: string;
  }): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.post(
      '/api/organizations',
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data;
  }

  async getUserOrganizations(userId: string): Promise<unknown[]> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.get(
      `/api/users/${encodeURIComponent(userId)}/organizations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data ?? [];
  }
}
