import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FacebookConnection } from './entities/facebook-connection.entity';
import { Post } from './entities/post.entity';
import { Website } from './entities/website.entity';
import { WebsiteFacebookConnection } from './entities/website-facebook-connection.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('database.url'),
        entities: [
          FacebookConnection,
          Post,
          Website,
          WebsiteFacebookConnection,
          WebhookDelivery,
        ],
        synchronize: process.env.NODE_ENV !== 'production', // Auto-sync in dev
        logging: process.env.NODE_ENV === 'development',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      FacebookConnection,
      Post,
      Website,
      WebsiteFacebookConnection,
      WebhookDelivery,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
