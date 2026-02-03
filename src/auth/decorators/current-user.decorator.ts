import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserInfo } from '../../common/interfaces/user.interface';
import type { RequestWithUser } from '../auth.guard';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserInfo => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
