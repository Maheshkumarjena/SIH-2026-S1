import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';

@Injectable()
export class LabBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  async listResources(departmentCodeOrId?: string) {
    let whereClause: any = {};
    if (departmentCodeOrId) {
      const dept = await this.prisma.department.findFirst({
        where: {
          OR: [
            { id: departmentCodeOrId },
            { code: { equals: departmentCodeOrId, mode: 'insensitive' } },
          ],
        },
      });
      if (dept) {
        whereClause = {
          OR: [{ departmentId: dept.id }, { departmentId: null }],
        };
      }
    }

    const items = await this.prisma.labResource.findMany({
      where: whereClause,
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });
    return { items };
  }

  async listForDate(resourceId: string, date: string) {
    const day = new Date(date);
    if (isNaN(day.getTime())) {
      return { items: [] };
    }
    const next = new Date(day);
    next.setUTCDate(day.getUTCDate() + 1);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(resourceId)) {
      return { items: [] };
    }
    const items = await this.prisma.labBooking.findMany({
      where: { resourceId, startTime: { gte: day, lt: next } },
      include: {
        section: { select: { batchLabel: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    return { items };
  }

  async book(
    user: AuthenticatedUser,
    dto: { resource_id: string; start_time: string; end_time: string; course_code?: string; faculty_ref?: string; section_id?: string },
  ) {
    const start = new Date(dto.start_time);
    const end = new Date(dto.end_time);
    const durationHours = (end.getTime() - start.getTime()) / 36e5;
    if (durationHours < 1 || durationHours > 4) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Booking must be 1-4 hours' });
    }
    const resource = await this.prisma.labResource.findUnique({ where: { id: dto.resource_id } });
    if (!resource) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lab resource not found' });
    }
    const conflict = await this.prisma.labBooking.findFirst({
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

    let sectionId = dto.section_id;
    if (!sectionId && user.role === 'student') {
      const student = await this.prisma.student.findUnique({ where: { userId: user.id } });
      if (student) {
        sectionId = student.sectionId;
      }
    }

    const booking = await this.prisma.labBooking.create({
      data: {
        resourceId: dto.resource_id,
        userId: user.id,
        sectionId,
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
    const booking = await this.prisma.labBooking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    }
    const updated = await this.prisma.labBooking.update({ where: { id }, data: { status: 'cancelled' } });
    this.events.emitToUser(user.id, 'booking.cancelled', { booking: updated });
    return updated;
  }
}
