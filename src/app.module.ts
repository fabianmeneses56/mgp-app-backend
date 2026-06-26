import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WeightHistoryModule } from './weight-history/weight-history.module';

@Module({
  imports: [
    ConfigModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT!,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      autoLoadEntities: true,
      synchronize: true,
    }),

    AuthModule,

    CategoriesModule,

    ExercisesModule,

    WeightHistoryModule,
  ],
})
export class AppModule {}
