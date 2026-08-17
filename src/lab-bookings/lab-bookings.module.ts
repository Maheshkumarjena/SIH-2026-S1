import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { LabBookingsController } from './lab-bookings.controller';
import { LabBookingsService } from './lab-bookings.service';

@Module({
  imports: [RealtimeModule],
  controllers: [LabBookingsController],
  providers: [LabBookingsService],
  exports: [LabBookingsService],
})
export class LabBookingsModule {}
