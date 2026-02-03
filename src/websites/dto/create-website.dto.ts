import { IsUrl, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateWebsiteDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsUrl()
  @IsNotEmpty()
  webhookUrl: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  authKey: string;
}
