import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WeightHistoryModule } from './weight-history/weight-history.module';
import { CloudflareR2Module } from './cloudflare-r2/cloudflare-r2.module';

@Module({
  imports: [
    ConfigModule.forRoot(),

    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT!,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: process.env.NODE_ENV === 'production',
      // DB_SSL=false lets a production deploy (VPS docker Postgres, no TLS)
      // opt out; unset keeps the previous behavior (SSL on in production, Railway).
      ssl:
        process.env.DB_SSL !== 'false' && process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
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
