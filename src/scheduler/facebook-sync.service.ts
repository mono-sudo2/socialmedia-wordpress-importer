import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios, { AxiosInstance } from 'axios';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { FacebookService } from '../facebook/facebook.service';
import { WebsitesService } from '../websites/websites.service';
import { LogtoService } from '../auth/logto.service';
import { ConfigService } from '@nestjs/config';

export interface SyncOptions {
  window?: number;
  offset?: number;
  limit?: number;
}

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
    private websitesService: WebsitesService,
    private logtoService: LogtoService,
    private configService: ConfigService,
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://graph.facebook.com/v20.0',
      timeout: 30000,
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    this.logger.log('Starting Facebook posts sync job');
    await this.syncAllConnections();
  }

  async syncAllConnections(): Promise<{ connectionsCount: number }> {
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

    return { connectionsCount: connections.length };
  }

  async syncConnectionById(
    connectionId: string,
    userId: string,
    options?: SyncOptions,
  ): Promise<{ postsProcessed: number }> {
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

    const postsProcessed = await this.syncConnection(connection, options);
    return { postsProcessed };
  }

  async syncConnection(
    connection: FacebookConnection,
    options?: SyncOptions,
  ): Promise<number> {
    this.logger.log(
      `Starting sync for connection ${connection.id} - pageId: ${connection.pageId || 'none'}, facebookUserId: ${connection.facebookUserId}, isActive: ${connection.isActive}, lastSyncAt: ${connection.lastSyncAt || 'never'}`,
    );

    let postsProcessed = 0;
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

      this.logger.log(
        `Using access token for sync - connectionId: ${connection.id}, pageId: ${connection.pageId || 'none'}, facebookUserId: ${connection.facebookUserId}, tokenLength: ${accessToken.length}, isPage: ${!!connection.pageId}`,
      );

      // Determine the target ID (page or user)
      const targetId = connection.pageId || connection.facebookUserId;

      const isPaginated = options?.window != null;

      // Fetch posts: paginated uses window + old since; full sync uses lastSyncAt
      const since = isPaginated
        ? 0 // Fetch from epoch to get most recent N
        : connection.lastSyncAt
          ? Math.floor(connection.lastSyncAt.getTime() / 1000)
          : Math.floor(Date.now() / 1000) - 86400; // Default to last 24 hours

      // Per-page limit: always use 100 (Facebook API max) for paginated requests
      // The window size determines maxPosts (total posts), not per-page limit
      // Pagination will fetch multiple pages until maxPosts is reached
      const fetchLimit = 100;
      
      // Calculate maxPosts needed: offset + limit when pagination options are provided
      const maxPosts = isPaginated
        ? (options!.offset ?? 0) + (options!.limit ?? Math.min(10, options!.window! - (options!.offset ?? 0)))
        : undefined;

      let posts = await this.fetchPosts(
        targetId,
        accessToken,
        since,
        !!connection.pageId,
        fetchLimit,
        maxPosts,
      );

      // Apply pagination slice when options provided
      if (isPaginated) {
        const offset = options!.offset ?? 0;
        const limit = options!.limit ?? Math.min(10, posts.length - offset);
        posts = posts.slice(offset, offset + limit);
      }

      this.logger.log(
        `Found ${posts.length} posts to process for connection ${connection.id}`,
      );

      for (const postData of posts) {
        const saved = await this.savePost(connection, postData);
        if (saved) postsProcessed++;
      }

      // Update last sync time only for full sync (not paginated)
      if (!isPaginated) {
        connection.lastSyncAt = new Date();
        await this.facebookConnectionRepository.save(connection);
      }
      return postsProcessed;
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
    isPage: boolean,
    limit = 100,
    maxPosts?: number,
  ): Promise<Array<any>> {
    const endpoint = isPage
      ? `/${targetId}/published_posts`
      : `/${targetId}/feed`;

    this.logger.log(
      `Fetching posts - targetId: ${targetId}, endpoint: ${endpoint}, isPage: ${isPage}, since: ${since}, limit: ${limit}, maxPosts: ${maxPosts || 'none'}, tokenLength: ${accessToken.length}`,
    );

    const allPosts: any[] = [];
    let nextUrl: string | null = null;
    let pageCount = 0;

    try {
      do {
        pageCount++;
        const requestUrl = nextUrl || endpoint;
        this.logger.debug(
          `Making request to fetch posts - page: ${pageCount}, url: ${requestUrl}`,
        );

        const response = nextUrl
          ? await this.axiosInstance.get(nextUrl)
          : await this.axiosInstance.get(endpoint, {
              params: {
                access_token: accessToken,
                fields: 'id,message,created_time,story,permalink_url',
                since,
                limit,
              },
            });

        this.logger.debug(
          `Posts API response status: ${response.status}, data keys: ${Object.keys(response.data || {}).join(', ')}`,
        );

        const posts = response.data.data || [];
        allPosts.push(...posts);

        this.logger.debug(
          `Fetched page ${pageCount}: ${posts.length} posts (total: ${allPosts.length})`,
        );

        // Get next page URL
        nextUrl = response.data.paging?.next || null;

        // Stop if we have enough posts
        if (maxPosts && allPosts.length >= maxPosts) {
          this.logger.log(
            `Reached maxPosts limit (${maxPosts}), stopping pagination`,
          );
          break;
        }
      } while (nextUrl && (!maxPosts || allPosts.length < maxPosts));

      this.logger.log(
        `Fetched ${allPosts.length} posts across ${pageCount} page(s)`,
      );

      return allPosts;
    } catch (error: any) {
      const statusCode = error.response?.status;
      const errorData = error.response?.data
        ? JSON.stringify(error.response.data)
        : 'No error data';
      const requestUrl = error.config?.url || endpoint;

      this.logger.error(
        `Failed to fetch posts - targetId: ${targetId}, endpoint: ${endpoint}, status: ${statusCode}, error: ${errorData}, requestUrl: ${requestUrl}`,
      );

      throw new Error(`Failed to fetch posts: ${error.message}`);
    }
  }

  private async savePost(
    connection: FacebookConnection,
    postData: any,
  ): Promise<boolean> {
    // Filter out cover photo updates
    const messageContent = postData.message || '';
    const storyContent = postData.story || '';
    const coverPhotoText = 'Zoologischer Stadtgarten Karlsruhe hat sein/ihr Titelbild aktualisiert.';
    
    if (messageContent.includes(coverPhotoText) || storyContent.includes(coverPhotoText)) {
      this.logger.debug(
        `Skipping cover photo update post: ${postData.id}`,
      );
      return false; // Post was skipped, not processed
    }

    // Check if post already exists
    const existingPost = await this.postRepository.findOne({
      where: { facebookPostId: postData.id },
    });

    // Fetch attachments via dedicated /{post-id}/attachments endpoint
    // (the attachments field on the post is deprecated in API v3.3+)
    const accessToken = await this.facebookService.getDecryptedAccessToken(
      connection,
    );
    const attachments = await this.facebookService.fetchPostAttachments(
      postData.id,
      accessToken,
    );

    let savedPost: Post;

    if (existingPost) {
      // Post already exists - use it and still send webhooks
      savedPost = existingPost;
    } else {
      // Create new post
      const post = this.postRepository.create({
        logtoOrgId: connection.logtoOrgId,
        facebookConnectionId: connection.id,
        facebookPostId: postData.id,
        postedAt: new Date(postData.created_time),
        webhookSent: false,
      });

      savedPost = await this.postRepository.save(post);
    }

    // Transform attachments into simplified structure
    const transformedAttachments = this.facebookService.transformAttachments(
      attachments,
    );

    const postPayload = {
      content: postData.message || postData.story || '',
      postType: postData.type || 'status',
      metadata: {
        permalinkUrl: postData.permalink_url,
        link: postData.link,
        story: postData.story,
      },
      attachments:
        transformedAttachments.length > 0 ? transformedAttachments : null,
      postedAt: savedPost.postedAt,
    };

    // Always send webhooks, regardless of whether they've been sent before
    try {
      await this.websitesService.sendWebhooksForPostWithPayload(
        savedPost,
        postPayload,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send webhooks for post ${savedPost.id}:`,
        error.message,
      );
    }

    return true;
  }
}
