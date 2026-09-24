import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { AppConfig } from '../../config/configuration';
import { UserRole } from '../../common/enums';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface TokenPayload {
  sub: number;
  email: string;
  role: UserRole;
  fullName: string;
}

interface RefreshPayload extends TokenPayload {
  type: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /** Registers a new user account and returns an authentication session. */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const totalUsers = await this.usersService.count();
    const role = totalUsers === 0 ? UserRole.ADMIN : (dto.role ?? UserRole.CASHIER);

    const user = await this.usersService.create({
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
      role,
      phone: dto.phone,
      isActive: true,
    });

    this.logger.log(`New user registered: ${user.email} (${user.role})`);
    return this.buildAuthResponse(user, false);
  }

  /** Validates credentials and issues an access + refresh token pair. */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact an administrator.',
      );
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.touchLastLogin(user.id);
    this.logger.log(`User ${user.email} (${user.role}) signed in`);

    return this.buildAuthResponse(user, Boolean(dto.remember));
  }

  /** Exchanges a valid refresh token for a fresh token pair. */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or has expired');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    const user = await this.usersService.findOne(payload.sub);
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    return this.buildAuthResponse(user, true);
  }

  /** Returns the profile of the currently authenticated principal. */
  async me(userId: number) {
    const user = await this.usersService.findOne(userId);
    return this.sanitize(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmailWithPassword(
      (await this.usersService.findOne(userId)).email,
    );
    if (!user) throw new UnauthorizedException('Account not found');

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'The new password must be different from the current one',
      );
    }

    await this.usersService.updatePassword(user.id, dto.newPassword);
    return { message: 'Password updated successfully' };
  }

  private async buildAuthResponse(
    user: User,
    longSession: boolean,
  ): Promise<AuthResponseDto> {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };

    const expiresIn = longSession ? '1d' : this.configService.get('jwt.expiresIn', { infer: true });
    const refreshExpiresIn = this.configService.get('jwt.refreshExpiresIn', {
      infer: true,
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as any, {
        secret: this.configService.get('jwt.secret', { infer: true }) as any,
        expiresIn: expiresIn as any,
      }),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' as const } as any,
        {
          secret: this.configService.get('jwt.refreshSecret', { infer: true }) as any,
          expiresIn: refreshExpiresIn as any,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.secondsFrom(expiresIn),
      user: this.sanitize(user),
    };
  }

  private sanitize(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      phone: user.phone ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  }

  /** Converts durations such as `8h` / `7d` / `900s` to seconds. */
  private secondsFrom(duration: string | number): number {
    if (typeof duration === 'number') return duration;
    const match = /^(\d+)\s*([smhd])?$/i.exec(duration.trim());
    if (!match) return 28800;
    const value = Number.parseInt(match[1], 10);
    switch ((match[2] ?? 's').toLowerCase()) {
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return value;
    }
  }
}
