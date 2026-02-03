import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Organization } from './entities/organization.entity';
import { User } from './entities/user.entity';
import { FacebookConnection } from './entities/facebook-connection.entity';
import { Post } from './entities/post.entity';
import { WebhookConfig } from './entities/webhook-config.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('database.url'),
        entities: [
          Organization,
          User,
          FacebookConnection,
          Post,
          WebhookConfig,
        ],
        synchronize: process.env.NODE_ENV !== 'production', // Auto-sync in dev
        logging: process.env.NODE_ENV === 'development',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      Organization,
      User,
      FacebookConnection,
      Post,
      WebhookConfig,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
