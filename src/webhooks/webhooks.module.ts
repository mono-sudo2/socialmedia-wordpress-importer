import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookConfig } from '../database/entities/webhook-config.entity';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { EncryptionService } from '../common/encryption.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookConfig,
      FacebookConnection,
      Post,
    ]),
    AuthModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, EncryptionService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
