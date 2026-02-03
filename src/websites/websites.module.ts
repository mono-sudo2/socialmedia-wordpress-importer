import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';
import { Website } from '../database/entities/website.entity';
import { WebsiteFacebookConnection } from '../database/entities/website-facebook-connection.entity';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Post } from '../database/entities/post.entity';
import { EncryptionService } from '../common/encryption.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Website,
      WebsiteFacebookConnection,
      FacebookConnection,
      Post,
    ]),
    AuthModule,
  ],
  controllers: [WebsitesController],
  providers: [WebsitesService, EncryptionService],
  exports: [WebsitesService],
})
export class WebsitesModule {}
