import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { User } from '../entities/user.entity';

export interface RequestWithUser extends Request {
  user: User;
}

export const GetUser = createParamDecorator(
  (
    data: keyof User | undefined,
    ctx: ExecutionContext,
  ): User | User[keyof User] => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user; // .user asi se llama tambien si lo llamamos desde el decorador  @Req()

    if (!user)
      throw new InternalServerErrorException('User not found (request)');

    return !data ? user : user[data];
  },
);
