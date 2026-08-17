import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';

interface LabResourceRecord {
  id: string;
  name: string;
  departmentId: string;
  capacity: number;
  restrictions: string | null;
}

interface LabBookingRecord {
  id: string;
  resourceId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  courseCode: string | null;
  facultyRef: string | null;
}

interface LabPrisma {
  labResource: {
    findMany(args: unknown): Promise<LabResourceRecord[]>;
    findUnique(args: unknown): Promise<LabResourceRecord | null>;
  };
  labBooking: {
    findMany(args: unknown): Promise<LabBookingRecord[]>;
    findFirst(args: unknown): Promise<LabBookingRecord | null>;
    findUnique(args: unknown): Promise<LabBookingRecord | null>;
    create(args: unknown): Promise<LabBookingRecord>;
    update(args: unknown): Promise<LabBookingRecord>;
  };
}

@Injectable()
export class LabBookingsService {
  private readonly db: LabPrisma;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {
    this.db = prisma as unknown as LabPrisma;
  }

  listResources() {
    return this.db.labResource.findMany({ orderBy: { name: 'asc' } }).then((items) => ({ items }));
  }

  async listForDate(resourceId: string, date: string) {
    const day = new Date(date);
    const next = new Date(day);
    next.setUTCDate(day.getUTCDate() + 1);
    const items = await this.db.labBooking.findMany({
      where: { resourceId, startTime: { gte: day, lt: next } },
      orderBy: { startTime: 'asc' },
    });
    return { items };
  }

  async book(user: AuthenticatedUser, dto: { resource_id: string; start_time: string; end_time: string; course_code?: string; faculty_ref?: string }) {
    const start = new Date(dto.start_time);
    const end = new Date(dto.end_time);
    const durationHours = (end.getTime() - start.getTime()) / 36e5;
    if (durationHours < 1 || durationHours > 4) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Booking must be 1-4 hours' });
    }
    const resource = await this.db.labResource.findUnique({ where: { id: dto.resource_id } });
    if (!resource) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lab resource not found' });
    }
    const conflict = await this.db.labBooking.findFirst({
      where: {
        resourceId: dto.resource_id,
        status: 'confirmed',
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
    if (conflict) {
      throw new ConflictException({ code: 'SLOT_CONFLICT', message: 'Slot is already booked' });
    }
    const booking = await this.db.labBooking.create({
      data: {
        resourceId: dto.resource_id,
        userId: user.id,
        startTime: start,
        endTime: end,
        courseCode: dto.course_code,
        facultyRef: dto.faculty_ref,
      },
    });
    this.events.emitToUser(user.id, 'booking.created', { booking });
    return booking;
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const booking = await this.db.labBooking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    }
    const updated = await this.db.labBooking.update({ where: { id }, data: { status: 'cancelled' } });
    this.events.emitToUser(user.id, 'booking.cancelled', { booking: updated });
    return updated;
  }
}
