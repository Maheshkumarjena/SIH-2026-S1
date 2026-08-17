import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { MockJwtAuthGuard } from '../common/guards/mock-jwt-auth.guard';
import { AuthenticatedUser } from '../common/types';
import { BookLabSlotDto } from './dto';
import { LabBookingsService } from './lab-bookings.service';

@UseGuards(MockJwtAuthGuard)
@Controller()
export class LabBookingsController {
  constructor(private readonly labBookings: LabBookingsService) {}

  @Get('lab-resources')
  listResources(): Promise<unknown> {
    return this.labBookings.listResources();
  }

  @Get('lab-bookings')
  listForDate(@Query('resource_id') resourceId: string, @Query('date') date: string): Promise<unknown> {
    return this.labBookings.listForDate(resourceId, date);
  }

  @Post('lab-bookings')
  book(@CurrentUser() user: AuthenticatedUser, @Body() dto: BookLabSlotDto): Promise<unknown> {
    return this.labBookings.book(user, dto);
  }

  @Delete('lab-bookings/:id')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.labBookings.cancel(id, user);
  }
}
