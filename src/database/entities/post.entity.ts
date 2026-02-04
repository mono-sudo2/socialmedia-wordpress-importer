import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { WebhookDelivery } from './webhook-delivery.entity';

@Entity('posts')
@Index(['facebookPostId'], { unique: true })
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  logtoOrgId: string;

  @Column({ type: 'uuid' })
  facebookConnectionId: string;

  @Column({ unique: true })
  facebookPostId: string;

  @Column()
  postedAt: Date;

  @Column({ default: false })
  webhookSent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => WebhookDelivery, (delivery) => delivery.post)
  webhookDeliveries: WebhookDelivery[];
}
