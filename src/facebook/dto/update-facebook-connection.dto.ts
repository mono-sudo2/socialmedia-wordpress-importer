import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateFacebookConnectionDto {
  @IsString()
  @IsOptional()
  @MaxLength(256)
  name?: string;
}
