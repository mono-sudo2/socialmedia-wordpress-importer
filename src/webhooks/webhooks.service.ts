import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { WebhookConfig } from '../database/entities/webhook-config.entity';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { EncryptionService } from '../common/encryption.service';
import type { UserInfo } from '../common/interfaces/user.interface';
import { CreateWebhookConfigDto } from './dto/create-webhook-config.dto';
import { UpdateWebhookConfigDto } from './dto/update-webhook-config.dto';

@Injectable()
export class WebhooksService {
  private readonly axiosInstance: AxiosInstance;

  constructor(
    @InjectRepository(WebhookConfig)
    private webhookConfigRepository: Repository<WebhookConfig>,
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

  async createConfig(
    userInfo: UserInfo,
    dto: CreateWebhookConfigDto,
  ): Promise<WebhookConfig> {
    // Validate that the connection belongs to user's organization
    await this.validateConnectionAccess(dto.facebookConnectionId, userInfo);

    const encryptedAuthKey = this.encryptionService.encrypt(dto.authKey);

    const config = this.webhookConfigRepository.create({
      facebookConnectionId: dto.facebookConnectionId,
      webhookUrl: dto.webhookUrl,
      encryptedAuthKey: encryptedAuthKey,
      isActive: true,
    });

    return await this.webhookConfigRepository.save(config);
  }

  async getConfigs(
    facebookConnectionId: string,
    userInfo: UserInfo,
  ): Promise<WebhookConfig[]> {
    // Validate that the connection belongs to user's organization
    await this.validateConnectionAccess(facebookConnectionId, userInfo);

    return await this.webhookConfigRepository.find({
      where: { facebookConnectionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getConfigById(
    id: string,
    userInfo: UserInfo,
  ): Promise<WebhookConfig> {
    const config = await this.webhookConfigRepository.findOne({
      where: { id },
      relations: ['facebookConnection'],
    });

    if (!config) {
      throw new NotFoundException('Webhook config not found');
    }

    // Validate that the connection belongs to user's organization
    await this.validateConnectionAccess(
      config.facebookConnectionId,
      userInfo,
    );

    return config;
  }

  async updateConfig(
    id: string,
    userInfo: UserInfo,
    dto: UpdateWebhookConfigDto,
  ): Promise<WebhookConfig> {
    const config = await this.getConfigById(id, userInfo);

    if (dto.webhookUrl !== undefined) {
      config.webhookUrl = dto.webhookUrl;
    }
    if (dto.authKey !== undefined) {
      config.encryptedAuthKey = this.encryptionService.encrypt(dto.authKey);
    }
    if (dto.isActive !== undefined) {
      config.isActive = dto.isActive;
    }

    return await this.webhookConfigRepository.save(config);
  }

  async deleteConfig(id: string, userInfo: UserInfo): Promise<void> {
    // This will throw if config doesn't exist or doesn't belong to user's org
    await this.getConfigById(id, userInfo);

    const result = await this.webhookConfigRepository.delete({ id });

    if (result.affected === 0) {
      throw new NotFoundException('Webhook config not found');
    }
  }

  async sendWebhook(post: Post): Promise<void> {
    // Find all active webhooks for this specific Facebook connection
    const webhookConfigs = await this.webhookConfigRepository.find({
      where: {
        facebookConnectionId: post.facebookConnectionId,
        isActive: true,
      },
    });

    if (webhookConfigs.length === 0) {
      return; // No webhooks configured for this connection
    }

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

    // Send webhook to each configured URL
    const sendPromises = webhookConfigs.map(async (config) => {
      try {
        const authKey = this.encryptionService.decrypt(config.encryptedAuthKey);
        const signature = this.generateSignature(payloadString, authKey);

        const response = await this.axiosInstance.post(config.webhookUrl, {
          ...payload,
          signature,
        });

        if (response.status >= 200 && response.status < 300) {
          return true;
        }

        return false;
      } catch (error) {
        // Log error but don't throw - webhook failures shouldn't break the sync
        console.error(
          `Failed to send webhook ${config.id} for post ${post.id}:`,
          error.message,
        );
        return false;
      }
    });

    await Promise.all(sendPromises);

    // Mark webhook as sent (at least one was attempted)
    if (!post.webhookSent) {
      post.webhookSent = true;
      await this.postRepository.save(post);
    }
  }

  async sendTestWebhook(
    id: string,
    userInfo: UserInfo,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfigById(id, userInfo);

    if (!config.isActive) {
      return {
        success: false,
        message: 'Webhook configuration is not active',
      };
    }

    const authKey = this.encryptionService.decrypt(config.encryptedAuthKey);

    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook from Facebook Importer API',
    };

    const payloadString = JSON.stringify(payload);
    const signature = this.generateSignature(payloadString, authKey);

    try {
      const response = await this.axiosInstance.post(config.webhookUrl, {
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
