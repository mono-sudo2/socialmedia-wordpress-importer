import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios, { AxiosInstance } from 'axios';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { FacebookService } from '../facebook/facebook.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacebookSyncService {
  private readonly logger = new Logger(FacebookSyncService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor(
    @InjectRepository(FacebookConnection)
    private facebookConnectionRepository: Repository<FacebookConnection>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    private facebookService: FacebookService,
    private webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://graph.facebook.com/v21.0',
      timeout: 30000,
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    this.logger.log('Starting Facebook posts sync job');
    await this.syncAllConnections();
  }

  async syncAllConnections(): Promise<void> {
    const connections = await this.facebookConnectionRepository.find({
      where: { isActive: true },
    });

    this.logger.log(`Found ${connections.length} active connections to sync`);

    for (const connection of connections) {
      try {
        await this.syncConnection(connection);
      } catch (error) {
        this.logger.error(
          `Failed to sync connection ${connection.id}:`,
          error.message,
        );
      }
    }
  }

  async syncConnection(connection: FacebookConnection): Promise<void> {
    try {
      // Check if token needs refresh before syncing
      if (this.facebookService.shouldRefreshToken(connection)) {
        try {
          this.logger.log(
            `Token for connection ${connection.id} expires soon, refreshing...`,
          );
          await this.facebookService.refreshConnectionToken(connection);
          // Reload connection to get updated token
          const updatedConnection = await this.facebookConnectionRepository.findOne({
            where: { id: connection.id },
          });
          if (updatedConnection) {
            Object.assign(connection, updatedConnection);
          }
        } catch (refreshError) {
          // If refresh fails, log but try to continue with old token
          // If it's a 401/403, the refresh method already marked it inactive
          if (
            refreshError.response?.status === 401 ||
            refreshError.response?.status === 403
          ) {
            this.logger.error(
              `Token refresh failed for connection ${connection.id}, connection marked as inactive`,
            );
            throw refreshError; // Don't proceed with sync if token is invalid
          }
          // For other errors (network, etc.), log and try to continue
          this.logger.warn(
            `Token refresh failed for connection ${connection.id}, attempting sync with existing token: ${refreshError.message}`,
          );
        }
      }

      const accessToken = await this.facebookService.getDecryptedAccessToken(
        connection,
      );

      // Determine the target ID (page or user)
      const targetId = connection.pageId || connection.facebookUserId;

      // Fetch posts since last sync
      const since = connection.lastSyncAt
        ? Math.floor(connection.lastSyncAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000) - 86400; // Default to last 24 hours

      const posts = await this.fetchPosts(targetId, accessToken, since);

      this.logger.log(
        `Found ${posts.length} new posts for connection ${connection.id}`,
      );

      for (const postData of posts) {
        await this.savePost(connection, postData);
      }

      // Update last sync time
      connection.lastSyncAt = new Date();
      await this.facebookConnectionRepository.save(connection);
    } catch (error) {
      // Check if it's a token expiration error
      if (error.response?.status === 401) {
        this.logger.warn(
          `Token expired for connection ${connection.id}, marking as inactive`,
        );
        connection.isActive = false;
        await this.facebookConnectionRepository.save(connection);
      }
      throw error;
    }
  }

  private async fetchPosts(
    targetId: string,
    accessToken: string,
    since: number,
  ): Promise<Array<any>> {
    try {
      const response = await this.axiosInstance.get(`/${targetId}/posts`, {
        params: {
          access_token: accessToken,
          fields:
            'id,message,created_time,type,permalink_url,link,story,attachments',
          since,
          limit: 100,
        },
      });

      return response.data.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch posts: ${error.message}`);
    }
  }

  private async fetchPostAttachments(
    postId: string,
    accessToken: string,
  ): Promise<any> {
    try {
      const allAttachments: any[] = [];
      let nextUrl: string | null = null;

      // Initial request - fetch attachments without limit
      do {
        const url = nextUrl || `/${postId}`;
        const params = nextUrl
          ? {} // If using nextUrl, it already contains all params
          : {
              access_token: accessToken,
              fields: 'attachments{subattachments{media}}',
            };

        const response = nextUrl
          ? await this.axiosInstance.get(nextUrl)
          : await this.axiosInstance.get(url, { params });

        const attachments = response.data.attachments?.data || [];
        
        // Fetch all subattachments for each attachment
        for (const attachment of attachments) {
          if (attachment.subattachments) {
            attachment.subattachments = await this.fetchAllSubattachments(
              attachment.subattachments,
              accessToken,
            );
          }
        }

        allAttachments.push(...attachments);

        // Check for next page
        nextUrl = response.data.attachments?.paging?.next || null;
      } while (nextUrl);

      return allAttachments.length > 0 ? { data: allAttachments } : null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch attachments for post ${postId}: ${error.message}`,
      );
      return null;
    }
  }

  private async fetchAllSubattachments(
    subattachments: any,
    accessToken: string,
  ): Promise<any> {
    const allSubattachments: any[] = [];
    let nextUrl: string | null = null;

    // If subattachments is already a data array (from initial response)
    if (subattachments.data) {
      allSubattachments.push(...subattachments.data);
      nextUrl = subattachments.paging?.next || null;
    } else if (Array.isArray(subattachments)) {
      allSubattachments.push(...subattachments);
    }

    // Fetch all remaining pages
    while (nextUrl) {
      try {
        const response = await this.axiosInstance.get(nextUrl);
        allSubattachments.push(...(response.data.data || []));
        nextUrl = response.data.paging?.next || null;
      } catch (error) {
        this.logger.warn(
          `Failed to fetch subattachments page: ${error.message}`,
        );
        break;
      }
    }

    return { data: allSubattachments };
  }

  private async savePost(
    connection: FacebookConnection,
    postData: any,
  ): Promise<void> {
    // Check if post already exists
    const existingPost = await this.postRepository.findOne({
      where: { facebookPostId: postData.id },
    });

    if (existingPost) {
      return; // Skip if already exists
    }

    // Fetch detailed attachments if post has attachments
    let attachments = null;
    if (postData.attachments) {
      const accessToken = await this.facebookService.getDecryptedAccessToken(
        connection,
      );
      attachments = await this.fetchPostAttachments(
        postData.id,
        accessToken,
      );
    }

    const post = this.postRepository.create({
      logtoOrgId: connection.logtoOrgId,
      facebookConnectionId: connection.id,
      facebookPostId: postData.id,
      content: postData.message || postData.story || '',
      postType: postData.type || 'status',
      metadata: {
        permalinkUrl: postData.permalink_url,
        link: postData.link,
        story: postData.story,
        attachments: attachments,
      },
      postedAt: new Date(postData.created_time),
      webhookSent: false,
    });

    const savedPost = await this.postRepository.save(post);

    // Send webhook if configured
    if (!savedPost.webhookSent) {
      try {
        await this.webhooksService.sendWebhook(savedPost);
      } catch (error) {
        this.logger.error(
          `Failed to send webhook for post ${savedPost.id}:`,
          error.message,
        );
        // Don't throw - webhook failure shouldn't break the sync
      }
    }
  }
}
