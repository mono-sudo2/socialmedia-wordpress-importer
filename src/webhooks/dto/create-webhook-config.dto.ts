import { IsUrl, IsNotEmpty, IsUUID, IsString, MinLength } from 'class-validator';

export class CreateWebhookConfigDto {
  @IsUUID()
  @IsNotEmpty()
  facebookConnectionId: string;

  @IsUrl()
  @IsNotEmpty()
  webhookUrl: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  authKey: string;
}
