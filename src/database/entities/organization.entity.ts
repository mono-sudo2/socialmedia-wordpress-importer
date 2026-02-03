import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { FacebookConnection } from './facebook-connection.entity';
import { Post } from './post.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  logtoOrgId: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => FacebookConnection, (connection) => connection.organization)
  facebookConnections: FacebookConnection[];

  @OneToMany(() => Post, (post) => post.organization)
  posts: Post[];
}
