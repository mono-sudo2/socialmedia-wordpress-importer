import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  IsArray,
  IsObject,
  ValidateIf,
} from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @IsNotEmpty()
  invitee: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsNumber()
  @IsNotEmpty()
  expiresAt: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationRoleIds?: string[];

  @IsOptional()
  @ValidateIf((o) => o.messagePayload !== false)
  @IsObject()
  messagePayload?: Record<string, unknown> | false;
}
