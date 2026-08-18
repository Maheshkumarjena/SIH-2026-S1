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
  async listResources(): Promise<unknown> {
    console.log(`[LabBookingsController.listResources] 🔬 Listing all lab resources`);
    const result = await this.labBookings.listResources();
    console.log(`[LabBookingsController.listResources] ✅ Returned ${(result as { items?: unknown[] })?.items?.length ?? 0} lab resources`);
    return result;
  }

  @Get('lab-bookings')
  async listForDate(@Query('resource_id') resourceId: string, @Query('date') date: string): Promise<unknown> {
    console.log(`[LabBookingsController.listForDate] 📅 Listing bookings for resource ${resourceId} on date: ${date}`);
    const result = await this.labBookings.listForDate(resourceId, date);
    console.log(`[LabBookingsController.listForDate] ✅ Returned bookings for date ${date}`);
    return result;
  }

  @Post('lab-bookings')
  async book(@CurrentUser() user: AuthenticatedUser, @Body() dto: BookLabSlotDto): Promise<unknown> {
    console.log(`[LabBookingsController.book] 🏷️ User ${user.id} (${user.role}) booking lab slot:`, dto);
    const result = await this.labBookings.book(user, dto);
    console.log(`[LabBookingsController.book] ✅ Lab slot booked successfully`);
    return result;
  }

  @Delete('lab-bookings/:id')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    console.log(`[LabBookingsController.cancel] ❌ User ${user.id} (${user.role}) cancelling lab booking: ${id}`);
    const result = await this.labBookings.cancel(id, user);
    console.log(`[LabBookingsController.cancel] ✅ Lab booking ${id} cancelled successfully`);
    return result;
  }
}
