import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthModule } from '../auth/auth.module';
import { FacebookModule } from '../facebook/facebook.module';
import { WebsitesModule } from '../websites/websites.module';

@Module({
  imports: [AuthModule, FacebookModule, WebsitesModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
