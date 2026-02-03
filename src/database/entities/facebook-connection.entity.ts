import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Post } from './post.entity';
import { WebhookConfig } from './webhook-config.entity';

@Entity('facebook_connections')
export class FacebookConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  logtoOrgId: string;

  @Column()
  facebookUserId: string;

  @Column('text')
  encryptedAccessToken: string;

  @Column('text', { nullable: true })
  encryptedRefreshToken: string;

  @Column({ nullable: true })
  tokenExpiresAt: Date;

  @Column({ type: 'varchar', nullable: true })
  pageId: string | null;

  @Column({ nullable: true })
  lastSyncAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  name?: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Post, (post) => post.facebookConnection)
  posts: Post[];

  @OneToMany(() => WebhookConfig, (config) => config.facebookConnection)
  webhookConfigs: WebhookConfig[];
}
