import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'A valid refresh token issued by /auth/login' })
  @IsJWT({ message: 'refreshToken must be a valid JWT' })
  refreshToken: string;
}
