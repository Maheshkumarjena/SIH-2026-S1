import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';

interface GrievanceRecord {
  id: string;
  userId: string | null;
  ownerUserId: string;
  category: string;
  description: string;
  anonymous: boolean;
  status: string;
  escalationLevel: number;
  slaDueAt: Date;
  createdAt: Date;
}

interface GrievancePrisma {
  grievance: {
    create(args: unknown): Promise<GrievanceRecord>;
    findMany(args: unknown): Promise<GrievanceRecord[]>;
    count(args: unknown): Promise<number>;
    findUnique(args: unknown): Promise<GrievanceRecord | null>;
    update(args: unknown): Promise<GrievanceRecord>;
  };
}

@Injectable()
export class GrievancesService {
  private readonly db: GrievancePrisma;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {
    this.db = prisma as unknown as GrievancePrisma;
  }

  async file(user: AuthenticatedUser, dto: { category: string; description: string; anonymous: boolean }) {
    const slaDueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.db.grievance.create({
      data: {
        userId: dto.anonymous ? null : user.id,
        ownerUserId: user.id,
        category: dto.category,
        description: dto.description,
        anonymous: dto.anonymous,
        slaDueAt,
      },
    });
  }

  async list(user: AuthenticatedUser, filters: Record<string, string | undefined>) {
    const page = Math.max(Number(filters.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(filters.limit ?? 20), 1), 100);

    let roleWhere: any = {};
    if (user.role === 'student') {
      roleWhere = { ownerUserId: user.id };
    } else if (user.role === 'admin') {
      roleWhere = {};
    } else if (user.role === 'warden') {
      roleWhere = { category: { in: ['hostel_maintenance', 'hostel', 'facility'] } };
    } else if (user.role === 'lab_incharge') {
      roleWhere = { category: { in: ['lab_resources', 'lab_equipment', 'lab', 'facility'] } };
    } else if (user.role === 'staff') {
      roleWhere = { category: { in: ['academic_evaluation', 'fee_dispute', 'academic', 'administrative'] } };
    }

    const where = {
      ...roleWhere,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.escalation_level ? { escalationLevel: Number(filters.escalation_level) } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.grievance.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.db.grievance.count({ where }),
    ]);
    return { items: items.map((item) => this.serialize(item, user)), total, page };
  }

  async getDetail(id: string, user: AuthenticatedUser) {
    const grievance = await this.db.grievance.findUnique({ where: { id } });
    if (!grievance) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Grievance not found' });
    }
    if (user.role === 'student' && grievance.ownerUserId !== user.id) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Grievance belongs to another user' });
    }
    return { ...this.serialize(grievance, user), escalation_history: [] };
  }

  async escalate(id: string, user: AuthenticatedUser) {
    const grievance = await this.db.grievance.findUnique({ where: { id } });
    if (!grievance) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Grievance not found' });
    }
    if (user.role === 'student' && grievance.slaDueAt > new Date()) {
      throw new BadRequestException({ code: 'SLA_WINDOW_NOT_YET_PASSED', message: 'SLA window has not passed yet' });
    }
    const updated = await this.db.grievance.update({
      where: { id },
      data: { escalationLevel: { increment: 1 }, status: 'escalated' },
    });
    this.events.emitToUser(grievance.ownerUserId, 'grievance.escalated', {
      grievance_id: id,
      escalation_level: updated.escalationLevel,
    });
    return { id: updated.id, escalation_level: updated.escalationLevel, escalated_at: new Date() };
  }

  private serialize(
    grievance: {
      id: string;
      userId: string | null;
      ownerUserId: string;
      category: string;
      description: string;
      anonymous: boolean;
      status: string;
      escalationLevel: number;
      slaDueAt: Date;
      createdAt: Date;
    },
    user: AuthenticatedUser,
  ) {
    const canSeeIdentity = !grievance.anonymous || grievance.ownerUserId === user.id;
    return {
      id: grievance.id,
      ...(canSeeIdentity ? { user_id: grievance.userId } : {}),
      category: grievance.category,
      description: grievance.description,
      anonymous: grievance.anonymous,
      status: grievance.status,
      escalation_level: grievance.escalationLevel,
      sla_due_at: grievance.slaDueAt,
      created_at: grievance.createdAt,
    };
  }
}
