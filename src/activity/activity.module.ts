import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityService } from './activity.service';
import { ActivityListener } from './listeners/activity.listener';
import { ActivityController } from './activity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog]), AuthModule],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityListener],
})
export class ActivityModule {}
