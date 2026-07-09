import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class CloudflareR2Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(configService: ConfigService) {
    const accountId = configService.get<string>('CLOUDFLARE_R2_ACCOUNT_ID');

    this.bucketName = configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME')!;
    this.publicUrl = configService.get<string>('CLOUDFLARE_R2_PUBLIC_URL')!;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configService.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID')!,
        secretAccessKey: configService.get<string>(
          'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
        )!,
      },
    });
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch {
      return;
    }
  }
}
