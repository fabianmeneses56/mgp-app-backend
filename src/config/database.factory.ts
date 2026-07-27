import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function buildDatabaseConfig(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const nodeEnv = configService.get<string>('NODE_ENV');
  const dbSslDisabled = configService.get('DB_SSL') === 'false';
  const isProduction = nodeEnv === 'production';

  return {
    type: 'postgres',
    host: configService.get('DB_HOST'),
    port: +configService.get('DB_PORT'),
    database: configService.get('DB_NAME'),
    username: configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    autoLoadEntities: true,
    synchronize: nodeEnv !== 'production',
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: isProduction,
    // DB_SSL=false overrides the production-implies-SSL default — needed for the
    // VPS deployment, whose Postgres container has no TLS listener (unlike Railway).
    ssl: !dbSslDisabled && isProduction ? { rejectUnauthorized: false } : false,
  };
}
