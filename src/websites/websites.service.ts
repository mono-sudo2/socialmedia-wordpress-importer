import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { Website } from '../database/entities/website.entity';
import { WebsiteFacebookConnection } from '../database/entities/website-facebook-connection.entity';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { EncryptionService } from '../common/encryption.service';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';

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
    private encryptionService: EncryptionService,
  ) {
    this.axiosInstance = axios.create({
      timeout: 10000,
      validateStatus: (status) => status < 500, // Don't throw on 4xx
    });
  }

  private generateSignature(payload: string, authKey: string): string {
    return crypto.createHmac('sha256', authKey).update(payload).digest('hex');
  }

  private async validateConnectionAccess(
    facebookConnectionId: string,
    userInfo: UserInfo,
  ): Promise<FacebookConnection> {
    const connection = await this.facebookConnectionRepository.findOne({
      where: {
        id: facebookConnectionId,
        logtoOrgId: userInfo.organizationId,
      },
    });

    if (!connection) {
      throw new ForbiddenException(
        'Facebook connection not found or does not belong to your organization',
      );
    }

    return connection;
  }

  async createWebsite(userInfo: UserInfo, dto: CreateWebsiteDto): Promise<Website> {
    const encryptedAuthKey = this.encryptionService.encrypt(dto.authKey);

    const website = this.websiteRepository.create({
      logtoOrgId: userInfo.organizationId,
      name: dto.name ?? null,
      webhookUrl: dto.webhookUrl,
      encryptedAuthKey,
      isActive: true,
    });

    return await this.websiteRepository.save(website);
  }

  async getWebsites(userInfo: UserInfo): Promise<Website[]> {
    return await this.websiteRepository.find({
      where: { logtoOrgId: userInfo.organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async getWebsiteById(id: string, userInfo: UserInfo): Promise<Website> {
    const website = await this.websiteRepository.findOne({
      where: { id },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    if (website.logtoOrgId !== userInfo.organizationId) {
      throw new ForbiddenException(
        'Website not found or does not belong to your organization',
      );
    }

    return website;
  }

  async getWebsiteConnections(
    websiteId: string,
    userInfo: UserInfo,
  ): Promise<FacebookConnection[]> {
    const website = await this.getWebsiteById(websiteId, userInfo);

    const connections = await this.websiteFacebookConnectionRepository.find({
      where: { websiteId },
      relations: ['facebookConnection'],
    });

    return connections.map((c) => c.facebookConnection);
  }

  async updateWebsite(
    id: string,
    userInfo: UserInfo,
    dto: UpdateWebsiteDto,
  ): Promise<Website> {
    const website = await this.getWebsiteById(id, userInfo);

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

  async deleteWebsite(id: string, userInfo: UserInfo): Promise<void> {
    await this.getWebsiteById(id, userInfo);

    const result = await this.websiteRepository.delete({ id });

    if (result.affected === 0) {
      throw new NotFoundException('Website not found');
    }
  }

  async connectToFacebookConnection(
    websiteId: string,
    facebookConnectionId: string,
    userInfo: UserInfo,
  ): Promise<WebsiteFacebookConnection> {
    const website = await this.getWebsiteById(websiteId, userInfo);
    await this.validateConnectionAccess(facebookConnectionId, userInfo);

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
    userInfo: UserInfo,
  ): Promise<void> {
    await this.getWebsiteById(websiteId, userInfo);
    await this.validateConnectionAccess(facebookConnectionId, userInfo);

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

  async sendWebhooksForPost(post: Post): Promise<void> {
    const websites = await this.getWebsitesForConnection(post.facebookConnectionId);

    if (websites.length === 0) {
      return;
    }

    const sendPromises = websites.map((website) =>
      this.sendWebhookToWebsite(post, website),
    );

    await Promise.all(sendPromises);

    if (!post.webhookSent) {
      post.webhookSent = true;
      await this.postRepository.save(post);
    }
  }

  private async sendWebhookToWebsite(
    post: Post,
    website: Website,
  ): Promise<void> {
    const payload = {
      event: 'new_post',
      timestamp: new Date().toISOString(),
      post: {
        id: post.id,
        facebookPostId: post.facebookPostId,
        content: post.content,
        postType: post.postType,
        metadata: post.metadata,
        attachments: post.metadata?.attachments || null,
        postedAt: post.postedAt.toISOString(),
      },
    };

    const payloadString = JSON.stringify(payload);

    try {
      const authKey = this.encryptionService.decrypt(website.encryptedAuthKey);
      const signature = this.generateSignature(payloadString, authKey);

      const response = await this.axiosInstance.post(website.webhookUrl, {
        ...payload,
        signature,
      });

      if (response.status < 200 || response.status >= 300) {
        console.error(
          `Webhook to website ${website.id} for post ${post.id} returned status ${response.status}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to send webhook to website ${website.id} for post ${post.id}:`,
        error.message,
      );
    }
  }

  async sendTestWebhook(
    id: string,
    userInfo: UserInfo,
  ): Promise<{ success: boolean; message: string }> {
    const website = await this.getWebsiteById(id, userInfo);

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

    try {
      const response = await this.axiosInstance.post(website.webhookUrl, {
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
