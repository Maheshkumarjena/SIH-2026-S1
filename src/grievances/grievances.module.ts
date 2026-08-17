import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { GrievancesController } from './grievances.controller';
import { GrievancesService } from './grievances.service';

@Module({
  imports: [RealtimeModule],
  controllers: [GrievancesController],
  providers: [GrievancesService],
  exports: [GrievancesService],
})
export class GrievancesModule {}
