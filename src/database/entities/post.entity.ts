import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';
import { FacebookConnection } from './facebook-connection.entity';

@Entity('posts')
@Index(['facebookPostId'], { unique: true })
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  facebookConnectionId: string;

  @Column({ unique: true })
  facebookPostId: string;

  @Column('text', { nullable: true })
  content: string;

  @Column()
  postType: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @Column()
  postedAt: Date;

  @Column({ default: false })
  webhookSent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, (org) => org.posts)
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => FacebookConnection, (connection) => connection.posts)
  @JoinColumn({ name: 'facebookConnectionId' })
  facebookConnection: FacebookConnection;
}
