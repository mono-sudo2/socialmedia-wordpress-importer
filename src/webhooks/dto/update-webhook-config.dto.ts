import { IsUrl, IsOptional, IsBoolean, IsString, MinLength } from 'class-validator';

export class UpdateWebhookConfigDto {
  @IsUrl()
  @IsOptional()
  webhookUrl?: string;

  @IsString()
  @IsOptional()
  @MinLength(32)
  authKey?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
