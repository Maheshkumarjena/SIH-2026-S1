import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  getForEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async search(filters: Record<string, string | undefined>) {
    const page = Math.max(Number(filters.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(filters.limit ?? 20), 1), 100);
    const where = {
      ...(filters.entity_type ? { entityType: filters.entity_type } : {}),
      ...(filters.action ? { action: filters.action } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page };
  }

  async verifyChain(entityType: string, entityId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
    let previous = 'GENESIS';
    for (const row of rows) {
      const expected = createHash('sha256').update(`${previous}${this.canonicalize(row.payloadJson)}`).digest('hex');
      if (expected !== row.entryHash || row.prevHash !== previous) {
        return { intact: false, broken_at_entry_id: row.id };
      }
      previous = row.entryHash;
    }
    return { intact: true };
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
