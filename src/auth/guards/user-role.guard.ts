import { Reflector } from '@nestjs/core';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
// import { User } from '../entities/user.entity';
import { META_ROLES } from '../decorators/role-protected.decorator';
import { RequestWithUser } from '../decorators/get-user.decorator';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector, // para obtener metadata/decoradores
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const validRoles: string[] = this.reflector.get(
      META_ROLES,
      context.getHandler(),
    );

    if (!validRoles) return true;
    if (validRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;

    if (!user) throw new BadRequestException('User not found');

    for (const role of user.roles) {
      if (validRoles.includes(role)) {
        return true;
      }
    }

    throw new ForbiddenException(
      `User ${user.fullName} need a valid role: [${validRoles.join(', ')}]`,
    );
  }
}
