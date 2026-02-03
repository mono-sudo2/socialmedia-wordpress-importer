import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  logtoUserId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ nullable: true })
  email: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, (org) => org.users)
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
