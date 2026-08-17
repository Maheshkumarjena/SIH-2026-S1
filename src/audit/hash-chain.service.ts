import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HashChainService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    entityType: string,
    entityId: string,
    action: string,
    actor: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const previous = await this.prisma.auditLog.findFirst({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    const prevHash = previous?.entryHash ?? 'GENESIS';
    const canonicalPayload = this.canonicalize(payload);
    const entryHash = createHash('sha256').update(`${prevHash}${canonicalPayload}`).digest('hex');

    await this.prisma.auditLog.create({
      data: {
        entityType,
        entityId,
        action,
        actor,
        payloadJson: payload as Prisma.InputJsonValue,
        prevHash,
        entryHash,
      },
    });
  }

  private canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalize(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.canonicalize(record[key])}`)
      .join(',')}}`;
  }
}
