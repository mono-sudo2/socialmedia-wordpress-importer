import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { WebsiteFacebookConnection } from './website-facebook-connection.entity';

@Entity('websites')
export class Website {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  logtoOrgId: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column()
  webhookUrl: string;

  @Column('text')
  encryptedAuthKey: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(
    () => WebsiteFacebookConnection,
    (wfc) => wfc.website,
  )
  websiteFacebookConnections: WebsiteFacebookConnection[];
}
