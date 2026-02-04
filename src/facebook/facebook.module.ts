import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { EncryptionService } from '../common/encryption.service';
import { AuthModule } from '../auth/auth.module';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacebookConnection]),
    ConfigModule,
    AuthModule,
    forwardRef(() => PostsModule),
  ],
  controllers: [FacebookController],
  providers: [FacebookService, EncryptionService],
  exports: [FacebookService],
})
export class FacebookModule {}
