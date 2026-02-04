import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { Website } from '../database/entities/website.entity';
import { WebsiteFacebookConnection } from '../database/entities/website-facebook-connection.entity';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity';
import { EncryptionService } from '../common/encryption.service';
import { LogtoService } from '../auth/logto.service';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';

export interface PostWebhookPayload {
  content: string;
  postType: string;
  metadata: Record<string, unknown> | null;
  postedAt: Date;
}

@Injectable()
export class WebsitesService {
  private readonly axiosInstance: AxiosInstance;

  constructor(
    @InjectRepository(Website)
    private websiteRepository: Repository<Website>,
    @InjectRepository(WebsiteFacebookConnection)
    private websiteFacebookConnectionRepository: Repository<WebsiteFacebookConnection>,
    @InjectRepository(FacebookConnection)
    private facebookConnectionRepository: Repository<FacebookConnection>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(WebhookDelivery)
    private webhookDeliveryRepository: Repository<WebhookDelivery>,
    private encryptionService: EncryptionService,
    private logtoService: LogtoService,
  ) {
    this.axiosInstance = axios.create({
      timeout: 10000,
      validateStatus: (status) => status < 500, // Don't throw on 4xx
    });
  }

  private generateSignature(payload: string, authKey: string): string {
    return crypto.createHmac('sha256', authKey).update(payload).digest('hex');
  }

  private buildWebhookUrl(baseUrl: string): string {
    // Remove trailing slash from baseUrl if present
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    // Append the hardcoded endpoint path
    return `${cleanUrl}/wp-json/social-importer/v1/import`;
  }

  private buildTestUrl(baseUrl: string): string {
    // Remove trailing slash from baseUrl if present
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    // Append the hardcoded test endpoint path
    return `${cleanUrl}/wp-json/social-importer/v1/test`;
  }

  private async verifyUserHasAccess(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const hasAccess = userOrgs.some(
      (org) => (org as { id: string }).id === organizationId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'Organization not found or you do not have access to it',
      );
    }
  }

  private async validateConnectionAccess(
    facebookConnectionId: string,
    organizationId: string,
  ): Promise<FacebookConnection> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: {
        id: facebookConnectionId,
        logtoOrgId: organizationId,
      },
    });

    if (!connection) {
      throw new ForbiddenException(
        'Facebook connection not found or does not belong to your organization',
      );
    }

    return connection;
  }

  async createWebsite(
    organizationId: string,
    userId: string,
    dto: CreateWebsiteDto,
  ): Promise<Website> {
    await this.verifyUserHasAccess(organizationId, userId);

    const encryptedAuthKey = this.encryptionService.encrypt(dto.authKey);

    const website = this.websiteRepository.create({
      logtoOrgId: organizationId,
      name: dto.name ?? null,
      webhookUrl: dto.webhookUrl,
      encryptedAuthKey,
      isActive: true,
    });

    return await this.websiteRepository.save(website);
  }

  async getWebsites(
    organizationId: string,
    userId: string,
  ): Promise<Website[]> {
    await this.verifyUserHasAccess(organizationId, userId);

    return await this.websiteRepository.find({
      where: { logtoOrgId: organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async getWebsiteById(id: string, userId: string): Promise<Website> {
    const website = await this.websiteRepository.findOne({
      where: { id },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    await this.verifyUserHasAccess(website.logtoOrgId, userId);
    return website;
  }

  async getWebsiteConnections(
    websiteId: string,
    userId: string,
  ): Promise<FacebookConnection[]> {
    const website = await this.getWebsiteById(websiteId, userId);

    const connections = await this.websiteFacebookConnectionRepository.find({
      where: { websiteId },
      relations: ['facebookConnection'],
    });

    return connections.map((c) => c.facebookConnection);
  }

  async updateWebsite(
    id: string,
    userId: string,
    dto: UpdateWebsiteDto,
  ): Promise<Website> {
    const website = await this.getWebsiteById(id, userId);

    if (dto.name !== undefined) {
      website.name = dto.name;
    }
    if (dto.webhookUrl !== undefined) {
      website.webhookUrl = dto.webhookUrl;
    }
    if (dto.authKey !== undefined) {
      website.encryptedAuthKey = this.encryptionService.encrypt(dto.authKey);
    }
    if (dto.isActive !== undefined) {
      website.isActive = dto.isActive;
    }

    return await this.websiteRepository.save(website);
  }

  async deleteWebsite(id: string, userId: string): Promise<void> {
    await this.getWebsiteById(id, userId);

    const result = await this.websiteRepository.delete({ id });

    if (result.affected === 0) {
      throw new NotFoundException('Website not found');
    }
  }

  async connectToFacebookConnection(
    websiteId: string,
    facebookConnectionId: string,
    userId: string,
  ): Promise<WebsiteFacebookConnection> {
    const website = await this.getWebsiteById(websiteId, userId);
    await this.validateConnectionAccess(
      facebookConnectionId,
      website.logtoOrgId,
    );

    const existing = await this.websiteFacebookConnectionRepository.findOne({
      where: { websiteId, facebookConnectionId },
    });

    if (existing) {
      return existing;
    }

    const connection = this.websiteFacebookConnectionRepository.create({
      websiteId,
      facebookConnectionId,
    });

    return await this.websiteFacebookConnectionRepository.save(connection);
  }

  async disconnectFromFacebookConnection(
    websiteId: string,
    facebookConnectionId: string,
    userId: string,
  ): Promise<void> {
    const website = await this.getWebsiteById(websiteId, userId);
    await this.validateConnectionAccess(
      facebookConnectionId,
      website.logtoOrgId,
    );

    const result = await this.websiteFacebookConnectionRepository.delete({
      websiteId,
      facebookConnectionId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Connection not found');
    }
  }

  async getWebsitesForConnection(
    facebookConnectionId: string,
  ): Promise<Website[]> {
    const connections = await this.websiteFacebookConnectionRepository.find({
      where: { facebookConnectionId },
      relations: ['website'],
    });

    return connections
      .map((c) => c.website)
      .filter((w) => w.isActive);
  }

  async sendWebhooksForPostWithPayload(
    post: Post,
    postPayload: PostWebhookPayload,
  ): Promise<WebhookDelivery[]> {
    const websites = await this.getWebsitesForConnection(post.facebookConnectionId);

    if (websites.length === 0) {
      return [];
    }

    const deliveries: WebhookDelivery[] = [];
    for (const website of websites) {
      const delivery = await this.sendWebhookToWebsite(post, website, postPayload);
      deliveries.push(delivery);
    }

    if (!post.webhookSent) {
      await this.postRepository.update({ id: post.id }, { webhookSent: true });
    }

    return deliveries;
  }

  private async sendWebhookToWebsite(
    post: Post,
    website: Website,
    postPayload: PostWebhookPayload,
  ): Promise<WebhookDelivery> {
    const payload = {
      event: 'new_post',
      timestamp: new Date().toISOString(),
      post: {
        id: post.id,
        facebookPostId: post.facebookPostId,
        content: postPayload.content,
        postType: postPayload.postType,
        metadata: postPayload.metadata,
        attachments: postPayload.metadata?.attachments || null,
        postedAt: postPayload.postedAt.toISOString(),
      },
    };

    const payloadString = JSON.stringify(payload);
    const sentAt = new Date();

    try {
      const authKey = this.encryptionService.decrypt(website.encryptedAuthKey);
      const signature = this.generateSignature(payloadString, authKey);
      const webhookUrl = this.buildWebhookUrl(website.webhookUrl);

      const response = await this.axiosInstance.post(webhookUrl, {
        ...payload,
        signature,
      });

      const isSuccess = response.status >= 200 && response.status < 300;
      const delivery = this.webhookDeliveryRepository.create({
        postId: post.id,
        websiteId: website.id,
        website,
        status: isSuccess ? 'success' : 'failed',
        statusCode: response.status,
        errorMessage: isSuccess ? null : `HTTP ${response.status}`,
        sentAt,
      });
      return await this.webhookDeliveryRepository.save(delivery);
    } catch (error) {
      const delivery = this.webhookDeliveryRepository.create({
        postId: post.id,
        websiteId: website.id,
        website,
        status: 'failed',
        statusCode: null,
        errorMessage: (error as Error).message,
        sentAt,
      });
      return await this.webhookDeliveryRepository.save(delivery);
    }
  }

  async resendWebhooksForPostWithPayload(
    post: Post,
    postPayload: PostWebhookPayload,
  ): Promise<WebhookDelivery[]> {
    return this.sendWebhooksForPostWithPayload(post, postPayload);
  }

  async sendTestWebhook(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const website = await this.getWebsiteById(id, userId);

    if (!website.isActive) {
      return {
        success: false,
        message: 'Website is not active',
      };
    }

    const authKey = this.encryptionService.decrypt(website.encryptedAuthKey);

    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook from Facebook Importer API',
    };

    const payloadString = JSON.stringify(payload);
    const signature = this.generateSignature(payloadString, authKey);
    const webhookUrl = this.buildTestUrl(website.webhookUrl);

    try {
      const response = await this.axiosInstance.post(webhookUrl, {
        ...payload,
        signature,
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          message: 'Test webhook sent successfully',
        };
      }

      return {
        success: false,
        message: `Webhook returned status ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send webhook: ${error.message}`,
      };
    }
  }
}
