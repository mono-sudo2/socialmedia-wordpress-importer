import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { UserInfo } from '../common/interfaces/user.interface';

interface M2MTokenCache {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class LogtoService {
  private readonly logger = new Logger(LogtoService.name);
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
      const apiResource =
        this.configService.get<string>('logto.apiResource') ??
        `${this.logtoEndpoint.replace(/\/$/, '')}/api`;

      const userInfoResponse = await this.axiosInstance.get(
        `/oidc/me?resource=${encodeURIComponent(apiResource)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const userInfo = userInfoResponse.data;

      if (!userInfo.sub) {
        throw new UnauthorizedException('Invalid token: missing user ID');
      }

      // Logto returns organization_id in the token claims for multi-tenant setups
      const organizationId = userInfo.organization_id || userInfo.org_id;

      return {
        userId: userInfo.sub,
        organizationId: organizationId || undefined,
        email: userInfo.email,
      };
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown };
        message?: string;
        code?: string;
      };
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data as
        | Record<string, string>
        | undefined;
      const logtoMessage =
        responseData?.error_description ??
        responseData?.message ??
        responseData?.error;

      this.logger.warn(
        `Token validation failed - status=${status ?? 'N/A'}, ` +
          `message=${axiosError.message ?? 'unknown'}, ` +
          `code=${axiosError.code ?? 'N/A'}, ` +
          `logto=${logtoMessage ?? 'N/A'}`,
      );

      if (status === 401) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const isDevelopment = process.env.NODE_ENV === 'development';
      const clientMessage =
        isDevelopment && logtoMessage
          ? `Failed to validate token: ${logtoMessage}`
          : 'Failed to validate token';

      throw new UnauthorizedException(clientMessage);
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

    const apiResource =
      this.configService.get<string>('logto.apiResource') ??
      `${this.logtoEndpoint.replace(/\/$/, '')}/api`;

    const tokenResponse = await this.axiosInstance.post(
      '/oidc/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.appId,
        client_secret: this.appSecret,
        resource: apiResource,
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
    const response = await this.axiosInstance.post('/api/organizations', data, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  }

  async addUserToOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const token = await this.getM2MAccessToken();
    await this.axiosInstance.post(
      `/api/organizations/${encodeURIComponent(organizationId)}/users`,
      { userIds: [userId] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
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

  async getOrganization(id: string): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.get(
      `/api/organizations/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  }

  async updateOrganization(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.patch(
      `/api/organizations/${encodeURIComponent(id)}`,
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

  async deleteOrganization(id: string): Promise<void> {
    const token = await this.getM2MAccessToken();
    await this.axiosInstance.delete(
      `/api/organizations/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  }

  async createOrganizationInvitation(data: {
    invitee: string;
    organizationId: string;
    expiresAt: number;
    inviterId?: string;
    organizationRoleIds?: string[];
    messagePayload?: Record<string, unknown> | false;
  }): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.post(
      '/api/organization-invitations',
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

  async getOrganizationInvitations(params?: {
    organizationId?: string;
    inviterId?: string;
    invitee?: string;
  }): Promise<unknown[]> {
    const token = await this.getM2MAccessToken();
    const searchParams = new URLSearchParams();
    if (params?.organizationId) {
      searchParams.set('organizationId', params.organizationId);
    }
    if (params?.inviterId) {
      searchParams.set('inviterId', params.inviterId);
    }
    if (params?.invitee) {
      searchParams.set('invitee', params.invitee);
    }
    const query = searchParams.toString();
    const url = query
      ? `/api/organization-invitations?${query}`
      : '/api/organization-invitations';
    const response = await this.axiosInstance.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data ?? [];
  }

  async getOrganizationUsers(
    organizationId: string,
    params?: { q?: string; page?: number; page_size?: number },
  ): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const searchParams = new URLSearchParams();
    if (params?.q) {
      searchParams.set('q', params.q);
    }
    if (params?.page !== undefined) {
      searchParams.set('page', String(params.page));
    }
    if (params?.page_size !== undefined) {
      searchParams.set('page_size', String(params.page_size));
    }
    const query = searchParams.toString();
    const url = query
      ? `/api/organizations/${encodeURIComponent(organizationId)}/users?${query}`
      : `/api/organizations/${encodeURIComponent(organizationId)}/users`;
    const response = await this.axiosInstance.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  }

  async getOrganizationInvitation(id: string): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.get(
      `/api/organization-invitations/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  }

  async updateOrganizationInvitationStatus(
    id: string,
    status: 'Accepted' | 'Revoked',
  ): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.put(
      `/api/organization-invitations/${encodeURIComponent(id)}/status`,
      { status },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data;
  }

  async getUser(userId: string): Promise<unknown> {
    const token = await this.getM2MAccessToken();
    const response = await this.axiosInstance.get(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  }
}
