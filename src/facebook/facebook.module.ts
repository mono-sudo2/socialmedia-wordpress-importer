import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';
import { FacebookConnection } from '../database/entities/facebook-connection.entity';
import { Organization } from '../database/entities/organization.entity';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacebookConnection, Organization]),
    ConfigModule,
  ],
  controllers: [FacebookController],
  providers: [FacebookService, EncryptionService],
  exports: [FacebookService],
})
export class FacebookModule {}
