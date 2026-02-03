import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { LogtoService } from './logto.service';
import type { UserInfo } from '../common/interfaces/user.interface';

export interface RequestWithUser extends Request {
  user: UserInfo;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private logtoService: LogtoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const userInfo = await this.logtoService.validateToken(token);

    request.user = userInfo;
    return true;
  }
}
