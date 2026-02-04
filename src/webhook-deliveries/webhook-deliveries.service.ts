import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookDelivery } from '../database/entities/webhook-delivery.entity';
import { LogtoService } from '../auth/logto.service';

export interface FindAllWebhookDeliveriesOptions {
  postId?: string;
  websiteId?: string;
  status?: 'success' | 'failed';
  page?: number;
  limit?: number;
}

@Injectable()
export class WebhookDeliveriesService {
  constructor(
    @InjectRepository(WebhookDelivery)
    private webhookDeliveryRepository: Repository<WebhookDelivery>,
    private logtoService: LogtoService,
  ) {}

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

  async findOne(id: string, userId: string): Promise<WebhookDelivery> {
    const delivery = await this.webhookDeliveryRepository.findOne({
      where: { id },
      relations: ['post', 'website'],
    });

    if (!delivery) {
      throw new NotFoundException('Webhook delivery not found');
    }

    await this.verifyUserHasAccess(delivery.post.logtoOrgId, userId);
    return delivery;
  }

  async findByOrganizationId(
    organizationId: string,
    userId: string,
    options: Omit<FindAllWebhookDeliveriesOptions, 'postId' | 'websiteId'> & {
      postId?: string;
      websiteId?: string;
    } = {},
  ): Promise<{
    data: WebhookDelivery[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.verifyUserHasAccess(organizationId, userId);

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));

    const qb = this.webhookDeliveryRepository
      .createQueryBuilder('delivery')
      .innerJoinAndSelect('delivery.post', 'post')
      .innerJoinAndSelect('delivery.website', 'website')
      .where('post.logtoOrgId = :organizationId', { organizationId });

    if (options.postId) {
      qb.andWhere('delivery.postId = :postId', { postId: options.postId });
    }
    if (options.websiteId) {
      qb.andWhere('delivery.websiteId = :websiteId', {
        websiteId: options.websiteId,
      });
    }
    if (options.status) {
      qb.andWhere('delivery.status = :status', { status: options.status });
    }

    qb.orderBy('delivery.sentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findAll(
    userId: string,
    options: FindAllWebhookDeliveriesOptions = {},
  ): Promise<{
    data: WebhookDelivery[];
    total: number;
    page: number;
    limit: number;
  }> {
    const userOrgs = await this.logtoService.getUserOrganizations(userId);
    const orgIds = (userOrgs as { id: string }[]).map((o) => o.id);

    if (orgIds.length === 0) {
      return { data: [], total: 0, page: 1, limit: 20 };
    }

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));

    const qb = this.webhookDeliveryRepository
      .createQueryBuilder('delivery')
      .innerJoinAndSelect('delivery.post', 'post')
      .innerJoinAndSelect('delivery.website', 'website')
      .where('post.logtoOrgId IN (:...orgIds)', { orgIds });

    if (options.postId) {
      qb.andWhere('delivery.postId = :postId', { postId: options.postId });
    }
    if (options.websiteId) {
      qb.andWhere('delivery.websiteId = :websiteId', {
        websiteId: options.websiteId,
      });
    }
    if (options.status) {
      qb.andWhere('delivery.status = :status', { status: options.status });
    }

    qb.orderBy('delivery.sentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }
}
