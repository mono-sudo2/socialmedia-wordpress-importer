import { IsUrl, IsOptional, IsBoolean, IsString, MinLength } from 'class-validator';

export class UpdateWebsiteDto {
  @IsString()
  @IsOptional()
  name?: string;

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
