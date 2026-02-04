import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { FacebookModule } from './facebook/facebook.module';
import { PostsModule } from './posts/posts.module';
import { WebsitesModule } from './websites/websites.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InvitationsModule } from './invitations/invitations.module';
import { MeModule } from './me/me.module';
import { WebhookDeliveriesModule } from './webhook-deliveries/webhook-deliveries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    AuthModule,
    FacebookModule,
    PostsModule,
    WebsitesModule,
    SchedulerModule,
    OrganizationsModule,
    InvitationsModule,
    MeModule,
    WebhookDeliveriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
