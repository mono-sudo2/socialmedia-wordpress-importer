import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  description?: string;
}
