import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
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
  private readonly logger = new Logger(WebsitesService.name);
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
    this.logger.log(
      `[Webhook] Starting webhook delivery process for post ${post.id} (Facebook connection: ${post.facebookConnectionId})`,
    );

    const websites = await this.getWebsitesForConnection(post.facebookConnectionId);

    if (websites.length === 0) {
      this.logger.log(
        `[Webhook] No active websites found for Facebook connection ${post.facebookConnectionId}`,
      );
      return [];
    }

    this.logger.log(
      `[Webhook] Found ${websites.length} active website(s) for connection ${post.facebookConnectionId}`,
    );
    websites.forEach((website, index) => {
      this.logger.debug(
        `[Webhook] Website ${index + 1}/${websites.length}: ${website.id} (${website.webhookUrl})`,
      );
    });

    const deliveries: WebhookDelivery[] = [];
    for (let i = 0; i < websites.length; i++) {
      const website = websites[i];
      this.logger.log(
        `[Webhook] Processing website ${i + 1}/${websites.length}: ${website.id}`,
      );
      const delivery = await this.sendWebhookToWebsite(post, website, postPayload);
      deliveries.push(delivery);
      this.logger.log(
        `[Webhook] Completed website ${i + 1}/${websites.length}: ${website.id} - Status: ${delivery.status}`,
      );
    }

    const successCount = deliveries.filter((d) => d.status === 'success').length;
    const failedCount = deliveries.filter((d) => d.status === 'failed').length;
    this.logger.log(
      `[Webhook] Webhook delivery completed for post ${post.id} - Success: ${successCount}, Failed: ${failedCount}`,
    );

    if (!post.webhookSent) {
      this.logger.debug(
        `[Webhook] Marking post ${post.id} as webhookSent=true`,
      );
      await this.postRepository.update({ id: post.id }, { webhookSent: true });
    }

    return deliveries;
  }

  private async sendWebhookToWebsite(
    post: Post,
    website: Website,
    postPayload: PostWebhookPayload,
  ): Promise<WebhookDelivery> {
    this.logger.log(
      `[Webhook] Starting webhook delivery for post ${post.id} to website ${website.id} (${website.webhookUrl})`,
    );

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

    this.logger.debug(
      `[Webhook] Payload prepared for website ${website.id}: ${JSON.stringify(payload, null, 2)}`,
    );

    // Validate encryptedAuthKey exists and is not empty
    this.logger.debug(
      `[Webhook] Validating encrypted auth key for website ${website.id}`,
    );
    if (!website.encryptedAuthKey || website.encryptedAuthKey.trim().length === 0) {
      this.logger.error(
        `[Webhook] FAILED - Website ${website.id} has missing or empty encrypted auth key`,
      );
      const delivery = this.webhookDeliveryRepository.create({
        postId: post.id,
        websiteId: website.id,
        website,
        status: 'failed',
        statusCode: null,
        errorMessage: 'Missing encrypted auth key - cannot generate signature',
        sentAt,
      });
      return await this.webhookDeliveryRepository.save(delivery);
    }

    this.logger.debug(
      `[Webhook] Encrypted auth key found for website ${website.id}, length: ${website.encryptedAuthKey.length} characters`,
    );

    let authKey: string;
    try {
      // Attempt to decrypt the auth key
      this.logger.debug(
        `[Webhook] Attempting to decrypt auth key for website ${website.id}`,
      );
      authKey = this.encryptionService.decrypt(website.encryptedAuthKey);
      if (!authKey || authKey.trim().length === 0) {
        throw new Error('Decrypted auth key is empty');
      }
      this.logger.debug(
        `[Webhook] Auth key decrypted successfully for website ${website.id}, length: ${authKey.length} characters`,
      );
    } catch (error) {
      const errorMessage = `Failed to decrypt auth key: ${(error as Error).message}`;
      this.logger.error(
        `[Webhook] FAILED - Decryption error for website ${website.id}: ${errorMessage}`,
      );
      const delivery = this.webhookDeliveryRepository.create({
        postId: post.id,
        websiteId: website.id,
        website,
        status: 'failed',
        statusCode: null,
        errorMessage,
        sentAt,
      });
      return await this.webhookDeliveryRepository.save(delivery);
    }

    try {
      this.logger.debug(
        `[Webhook] Generating signature for website ${website.id}`,
      );
      const signature = this.generateSignature(payloadString, authKey);
      this.logger.debug(
        `[Webhook] Signature generated: ${signature.substring(0, 16)}... (length: ${signature.length})`,
      );

      const webhookUrl = this.buildWebhookUrl(website.webhookUrl);
      this.logger.log(
        `[Webhook] Sending POST request to ${webhookUrl} for post ${post.id} (website ${website.id})`,
      );

      const requestPayload = {
        ...payload,
        signature,
      };
      this.logger.debug(
        `[Webhook] Request payload includes signature: ${signature ? 'YES' : 'NO'}`,
      );
      this.logger.debug(
        `[Webhook] Full request payload keys: ${Object.keys(requestPayload).join(', ')}`,
      );

      const response = await this.axiosInstance.post(webhookUrl, requestPayload);

      // Explicitly check status codes
      const statusCode = response.status;
      const isSuccess = statusCode >= 200 && statusCode < 300;
      const isValidationFailure = statusCode >= 400 && statusCode < 500;
      const isServerError = statusCode >= 500;

      this.logger.log(
        `[Webhook] Response received from ${webhookUrl} - Status: ${statusCode}`,
      );
      this.logger.debug(
        `[Webhook] Response headers: ${JSON.stringify(response.headers)}`,
      );
      this.logger.debug(
        `[Webhook] Response data: ${JSON.stringify(response.data)}`,
      );

      // Log response status
      if (isSuccess) {
        this.logger.log(
          `[Webhook] SUCCESS - Webhook delivered successfully to ${webhookUrl} - Status: ${statusCode}`,
        );
      } else if (isValidationFailure) {
        this.logger.warn(
          `[Webhook] VALIDATION FAILURE - Webhook endpoint returned ${statusCode} for ${webhookUrl}. This may indicate missing or invalid signature validation on the receiving end.`,
        );
        this.logger.warn(
          `[Webhook] Response data: ${JSON.stringify(response.data)}`,
        );
      } else if (isServerError) {
        this.logger.error(
          `[Webhook] SERVER ERROR - Webhook endpoint returned ${statusCode} for ${webhookUrl}`,
        );
        this.logger.error(
          `[Webhook] Response data: ${JSON.stringify(response.data)}`,
        );
      }

      // Extract error message from response if available
      let errorMessage: string | null = null;
      if (!isSuccess) {
        if (isValidationFailure) {
          errorMessage = `Validation failure: HTTP ${statusCode}`;
          // Try to extract error message from response data if available
          if (response.data && typeof response.data === 'object') {
            const responseError = response.data.error || response.data.message;
            if (responseError) {
              errorMessage += ` - ${responseError}`;
            }
          }
        } else if (isServerError) {
          errorMessage = `Server error: HTTP ${statusCode}`;
          if (response.data && typeof response.data === 'object') {
            const responseError = response.data.error || response.data.message;
            if (responseError) {
              errorMessage += ` - ${responseError}`;
            }
          }
        } else {
          errorMessage = `HTTP ${statusCode}`;
        }
      }

      const delivery = this.webhookDeliveryRepository.create({
        postId: post.id,
        websiteId: website.id,
        website,
        status: isSuccess ? 'success' : 'failed',
        statusCode,
        errorMessage,
        sentAt,
      });
      const savedDelivery = await this.webhookDeliveryRepository.save(delivery);
      this.logger.log(
        `[Webhook] Delivery record saved with status: ${savedDelivery.status}, statusCode: ${savedDelivery.statusCode}`,
      );
      return savedDelivery;
    } catch (error) {
      // Network errors, timeouts, etc.
      const errorMessage = `Network error: ${(error as Error).message}`;
      this.logger.error(
        `[Webhook] EXCEPTION - Webhook delivery failed for website ${website.id} (post ${post.id}): ${errorMessage}`,
      );
      this.logger.error(
        `[Webhook] Error stack: ${(error as Error).stack}`,
      );

      // Check if it's an axios error with response data
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `[Webhook] Axios error details - Code: ${error.code}, Message: ${error.message}`,
        );
        if (error.response) {
          const statusCode = error.response.status;
          const isValidationFailure = statusCode >= 400 && statusCode < 500;
          const isServerError = statusCode >= 500;

          this.logger.error(
            `[Webhook] Axios response received - Status: ${statusCode}, Headers: ${JSON.stringify(error.response.headers)}`,
          );
          this.logger.error(
            `[Webhook] Axios response data: ${JSON.stringify(error.response.data)}`,
          );

          let detailedErrorMessage = errorMessage;
          if (isValidationFailure) {
            detailedErrorMessage = `Validation failure: HTTP ${statusCode}`;
          } else if (isServerError) {
            detailedErrorMessage = `Server error: HTTP ${statusCode}`;
          }

          if (error.response.data && typeof error.response.data === 'object') {
            const responseError = error.response.data.error || error.response.data.message;
            if (responseError) {
              detailedErrorMessage += ` - ${responseError}`;
            }
          }

          const delivery = this.webhookDeliveryRepository.create({
            postId: post.id,
            websiteId: website.id,
            website,
            status: 'failed',
            statusCode,
            errorMessage: detailedErrorMessage,
            sentAt,
          });
          return await this.webhookDeliveryRepository.save(delivery);
        } else if (error.request) {
          this.logger.error(
            `[Webhook] Axios request was made but no response received. Request: ${JSON.stringify(error.request)}`,
          );
        }
      }

      const delivery = this.webhookDeliveryRepository.create({
        postId: post.id,
        websiteId: website.id,
        website,
        status: 'failed',
        statusCode: null,
        errorMessage,
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
    this.logger.log(
      `[TestWebhook] Starting test webhook for website ${id} by user ${userId}`,
    );

    const website = await this.getWebsiteById(id, userId);

    if (!website.isActive) {
      this.logger.warn(
        `[TestWebhook] Website ${website.id} is not active`,
      );
      return {
        success: false,
        message: 'Website is not active',
      };
    }

    this.logger.log(
      `[TestWebhook] Website ${website.id} is active, webhook URL: ${website.webhookUrl}`,
    );

    // Validate encryptedAuthKey exists and is not empty
    this.logger.debug(
      `[TestWebhook] Validating encrypted auth key for website ${website.id}`,
    );
    if (!website.encryptedAuthKey || website.encryptedAuthKey.trim().length === 0) {
      this.logger.error(
        `[TestWebhook] FAILED - Website ${website.id} has missing or empty encrypted auth key`,
      );
      return {
        success: false,
        message: 'Missing encrypted auth key - cannot generate signature',
      };
    }

    this.logger.debug(
      `[TestWebhook] Encrypted auth key found for website ${website.id}, length: ${website.encryptedAuthKey.length} characters`,
    );

    let authKey: string;
    try {
      // Attempt to decrypt the auth key
      this.logger.debug(
        `[TestWebhook] Attempting to decrypt auth key for website ${website.id}`,
      );
      authKey = this.encryptionService.decrypt(website.encryptedAuthKey);
      if (!authKey || authKey.trim().length === 0) {
        throw new Error('Decrypted auth key is empty');
      }
      this.logger.debug(
        `[TestWebhook] Auth key decrypted successfully for website ${website.id}, length: ${authKey.length} characters`,
      );
    } catch (error) {
      const errorMessage = `Failed to decrypt auth key: ${(error as Error).message}`;
      this.logger.error(
        `[TestWebhook] FAILED - Decryption error for website ${website.id}: ${errorMessage}`,
      );
      return {
        success: false,
        message: errorMessage,
      };
    }

    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook from Facebook Importer API',
    };

    const payloadString = JSON.stringify(payload);
    this.logger.debug(
      `[TestWebhook] Payload prepared: ${payloadString}`,
    );

    this.logger.debug(
      `[TestWebhook] Generating signature for website ${website.id}`,
    );
    const signature = this.generateSignature(payloadString, authKey);
    this.logger.debug(
      `[TestWebhook] Signature generated: ${signature.substring(0, 16)}... (length: ${signature.length})`,
    );

    const webhookUrl = this.buildTestUrl(website.webhookUrl);
    this.logger.log(
      `[TestWebhook] Sending POST request to ${webhookUrl} for website ${website.id}`,
    );

    const requestPayload = {
      ...payload,
      signature,
    };
    this.logger.debug(
      `[TestWebhook] Request payload includes signature: ${signature ? 'YES' : 'NO'}`,
    );
    this.logger.debug(
      `[TestWebhook] Full request payload: ${JSON.stringify(requestPayload)}`,
    );

    try {
      const response = await this.axiosInstance.post(webhookUrl, requestPayload);

      const statusCode = response.status;
      const isSuccess = statusCode >= 200 && statusCode < 300;
      const isValidationFailure = statusCode >= 400 && statusCode < 500;
      const isServerError = statusCode >= 500;

      this.logger.log(
        `[TestWebhook] Response received from ${webhookUrl} - Status: ${statusCode}`,
      );
      this.logger.debug(
        `[TestWebhook] Response headers: ${JSON.stringify(response.headers)}`,
      );
      this.logger.debug(
        `[TestWebhook] Response data: ${JSON.stringify(response.data)}`,
      );

      // Log response status
      if (isSuccess) {
        this.logger.log(
          `[TestWebhook] SUCCESS - Test webhook delivered successfully to ${webhookUrl} - Status: ${statusCode}`,
        );
        return {
          success: true,
          message: 'Test webhook sent successfully',
        };
      } else if (isValidationFailure) {
        this.logger.warn(
          `[TestWebhook] VALIDATION FAILURE - Test webhook endpoint returned ${statusCode} for ${webhookUrl}. This may indicate missing or invalid signature validation on the receiving end.`,
        );
        this.logger.warn(
          `[TestWebhook] Response data: ${JSON.stringify(response.data)}`,
        );
        let message = `Validation failure: HTTP ${statusCode}`;
        if (response.data && typeof response.data === 'object') {
          const responseError = response.data.error || response.data.message;
          if (responseError) {
            message += ` - ${responseError}`;
          }
        }
        return {
          success: false,
          message,
        };
      } else if (isServerError) {
        this.logger.error(
          `[TestWebhook] SERVER ERROR - Test webhook endpoint returned ${statusCode} for ${webhookUrl}`,
        );
        this.logger.error(
          `[TestWebhook] Response data: ${JSON.stringify(response.data)}`,
        );
        let message = `Server error: HTTP ${statusCode}`;
        if (response.data && typeof response.data === 'object') {
          const responseError = response.data.error || response.data.message;
          if (responseError) {
            message += ` - ${responseError}`;
          }
        }
        return {
          success: false,
          message,
        };
      }

      this.logger.warn(
        `[TestWebhook] Unexpected status code ${statusCode} from ${webhookUrl}`,
      );
      return {
        success: false,
        message: `Webhook returned status ${statusCode}`,
      };
    } catch (error) {
      // Network errors, timeouts, etc.
      let errorMessage = `Network error: ${(error as Error).message}`;
      this.logger.error(
        `[TestWebhook] EXCEPTION - Test webhook failed for website ${website.id}: ${errorMessage}`,
      );
      this.logger.error(
        `[TestWebhook] Error stack: ${(error as Error).stack}`,
      );

      // Check if it's an axios error with response data
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `[TestWebhook] Axios error details - Code: ${error.code}, Message: ${error.message}`,
        );
        if (error.response) {
          const statusCode = error.response.status;
          const isValidationFailure = statusCode >= 400 && statusCode < 500;
          const isServerError = statusCode >= 500;

          this.logger.error(
            `[TestWebhook] Axios response received - Status: ${statusCode}, Headers: ${JSON.stringify(error.response.headers)}`,
          );
          this.logger.error(
            `[TestWebhook] Axios response data: ${JSON.stringify(error.response.data)}`,
          );

          if (isValidationFailure) {
            errorMessage = `Validation failure: HTTP ${statusCode}`;
          } else if (isServerError) {
            errorMessage = `Server error: HTTP ${statusCode}`;
          }

          if (error.response.data && typeof error.response.data === 'object') {
            const responseError = error.response.data.error || error.response.data.message;
            if (responseError) {
              errorMessage += ` - ${responseError}`;
            }
          }
        } else if (error.request) {
          this.logger.error(
            `[TestWebhook] Axios request was made but no response received. Request: ${JSON.stringify(error.request)}`,
          );
        }
      }

      return {
        success: false,
        message: errorMessage,
      };
    }
  }
}
