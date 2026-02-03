import { IsUUID, IsNotEmpty } from 'class-validator';

export class ConnectWebsiteDto {
  @IsUUID()
  @IsNotEmpty()
  facebookConnectionId: string;
}
