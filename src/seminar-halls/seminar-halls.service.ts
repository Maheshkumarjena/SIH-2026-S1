import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcherService } from '../realtime/event-dispatcher.service';

@Injectable()
export class SeminarHallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  async listHalls() {
    const items = await this.prisma.seminarHall.findMany({
      include: { department: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
    return { items };
  }

  async checkAvailability(hallId: string, startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const hall = await this.prisma.seminarHall.findUnique({ where: { id: hallId } });
    if (!hall) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Seminar hall not found' });
    }

    const conflict = await this.prisma.seminarHallBooking.findFirst({
      where: {
        hallId,
        status: 'confirmed',
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    return {
      hallId,
      available: !conflict,
      hallName: hall.name,
      capacity: hall.capacity,
      approvalRequired: hall.capacity >= 200 || hall.name.toLowerCase().includes('auditorium'),
    };
  }

  async book(user: AuthenticatedUser, dto: { hall_id: string; purpose: string; start_time: string; end_time: string }) {
    const start = new Date(dto.start_time);
    const end = new Date(dto.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid start or end time' });
    }

    const hall = await this.prisma.seminarHall.findUnique({ where: { id: dto.hall_id } });
    if (!hall) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Seminar hall not found' });
    }

    const conflict = await this.prisma.seminarHallBooking.findFirst({
      where: {
        hallId: dto.hall_id,
        status: 'confirmed',
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    if (conflict) {
      throw new ConflictException({ code: 'SLOT_CONFLICT', message: 'Seminar hall is already booked for this time slot' });
    }

    const approvalRequired = hall.capacity >= 200 || hall.name.toLowerCase().includes('auditorium');

    const booking = await this.prisma.seminarHallBooking.create({
      data: {
        hallId: dto.hall_id,
        bookedByUserId: user.id,
        purpose: dto.purpose,
        startTime: start,
        endTime: end,
        status: approvalRequired ? 'pending_approval' : 'confirmed',
        approvalRequired,
      },
      include: {
        hall: true,
      },
    });

    this.events.emitToUser(user.id, 'seminar_hall.booked', { booking });
    return booking;
  }
}
