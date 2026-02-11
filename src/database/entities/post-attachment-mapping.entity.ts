import { Entity, Column, Index, Unique } from 'typeorm';

@Entity('post_attachment_mappings')
@Unique(['facebookConnectionId', 'attachmentFacebookId'])
@Index(['facebookConnectionId', 'attachmentFacebookId'])
export class PostAttachmentMapping {
  @Column({ type: 'uuid', primary: true })
  facebookConnectionId: string;

  @Column({ type: 'varchar', primary: true })
  attachmentFacebookId: string;

  @Column({ type: 'varchar' })
  facebookPostId: string;
}
