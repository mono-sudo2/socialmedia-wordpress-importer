import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FacebookSyncService } from './facebook-sync.service';
import { SchedulerController } from './scheduler.controller';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { FacebookModule } from '../facebook/facebook.module';
import { WebsitesModule } from '../websites/websites.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([FacebookConnection, Post]),
    ConfigModule,
    FacebookModule,
    WebsitesModule,
    AuthModule,
  ],
  controllers: [SchedulerController],
  providers: [FacebookSyncService],
})
export class SchedulerModule {}
