import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { RegisterDto } from '@codity/shared';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@codity/database';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashPassword(dto.passwordRaw);
    
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.MEMBER, // default role
        },
      });

      // Create a default personal organization for the user
      const org = await tx.organization.create({
        data: {
          name: `${dto.firstName}'s Org`,
        },
      });

      // Bind member
      await tx.orgMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: UserRole.ADMIN, // Admin of their own organization
        },
      });

      // Create a default project in the organization
      const project = await tx.project.create({
        data: {
          name: 'Default Project',
          organizationId: org.id,
        },
      });

      // Create a default queue in the project
      await tx.queue.create({
        data: {
          name: 'default',
          projectId: project.id,
          concurrencyLimit: 10,
        },
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: org.id,
        projectId: project.id,
      };
    });
  }

  async login(email: string, passwordRaw: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                projects: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await this.comparePassword(passwordRaw, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    
    // Refresh token
    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7); // 7 days

    const refreshTokenVal = this.jwtService.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenVal,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    // Extract first organization and project
    const defaultOrg = user.memberships[0]?.organization;
    const defaultProject = defaultOrg?.projects[0];

    return {
      accessToken,
      refreshToken: refreshTokenVal,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      organization: defaultOrg ? { id: defaultOrg.id, name: defaultOrg.name } : null,
      project: defaultProject ? { id: defaultProject.id, name: defaultProject.name } : null,
    };
  }

  async refreshToken(tokenStr: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tokenStr);
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: tokenStr },
    });

    if (!tokenRecord || tokenRecord.revokedAt || new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found or deleted');
    }

    // Revoke old token and issue new ones (Token Rotation)
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    const newPayload = { sub: user.id, email: user.email, role: user.role };
    const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });

    const newRefreshTokenExpiresAt = new Date();
    newRefreshTokenExpiresAt.setDate(newRefreshTokenExpiresAt.getDate() + 7);
    const newRefreshTokenVal = this.jwtService.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshTokenVal,
        expiresAt: newRefreshTokenExpiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenVal,
    };
  }

  async logout(tokenStr: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: tokenStr },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }
}
