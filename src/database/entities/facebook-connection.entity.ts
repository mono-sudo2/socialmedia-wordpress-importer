import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Post } from './post.entity';
import { WebhookConfig } from './webhook-config.entity';

@Entity('facebook_connections')
export class FacebookConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column()
  facebookUserId: string;

  @Column('text')
  encryptedAccessToken: string;

  @Column('text', { nullable: true })
  encryptedRefreshToken: string;

  @Column({ nullable: true })
  tokenExpiresAt: Date;

  @Column({ nullable: true })
  pageId: string | null;

  @Column({ nullable: true })
  lastSyncAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, (org) => org.facebookConnections)
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @OneToMany(() => Post, (post) => post.facebookConnection)
  posts: Post[];

  @OneToMany(() => WebhookConfig, (config) => config.facebookConnection)
  webhookConfigs: WebhookConfig[];
}
