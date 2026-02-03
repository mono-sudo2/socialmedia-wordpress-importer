import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserInfo } from '../common/interfaces/user.interface';

@Injectable()
export class RequiresOrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserInfo | undefined;

    if (!user?.organizationId) {
      throw new UnauthorizedException(
        'This endpoint requires an organization. Please select or create an organization first.',
      );
    }

    return true;
  }
}
