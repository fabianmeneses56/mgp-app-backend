import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WeightHistoryModule } from './weight-history/weight-history.module';
import { CloudflareR2Module } from './cloudflare-r2/cloudflare-r2.module';
import { buildDatabaseConfig } from './config/database.factory';

@Module({
  imports: [
    ConfigModule.forRoot(),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return buildDatabaseConfig(configService);
      },
    }),

    AuthModule,

    CloudflareR2Module,

    CategoriesModule,

    ExercisesModule,

    WeightHistoryModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
