import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FacebookConnection } from './facebook-connection.entity';

@Entity('webhook_configs')
export class WebhookConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  facebookConnectionId: string;

  @Column()
  webhookUrl: string;

  @Column('text')
  encryptedAuthKey: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => FacebookConnection, (conn) => conn.webhookConfigs)
  @JoinColumn({ name: 'facebookConnectionId' })
  facebookConnection: FacebookConnection;
}
