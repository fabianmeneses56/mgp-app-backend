import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';
import { ActivityService } from './activity.service';
import { FindActivityDto } from './dto/find-activity.dto';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @Auth()
  findAllByUser(@Query() { limit }: FindActivityDto, @GetUser() user: User) {
    return this.activityService.findAllByUser(user, limit);
  }
}
