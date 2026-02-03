import {
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Website } from './website.entity';
import { FacebookConnection } from './facebook-connection.entity';

@Entity('website_facebook_connections')
export class WebsiteFacebookConnection {
  @PrimaryColumn('uuid')
  websiteId: string;

  @PrimaryColumn('uuid')
  facebookConnectionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Website, (website) => website.websiteFacebookConnections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'websiteId' })
  website: Website;

  @ManyToOne(() => FacebookConnection, (connection) => connection.websiteConnections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'facebookConnectionId' })
  facebookConnection: FacebookConnection;
}
