import { Module } from '@nestjs/common';
import { SeminarHallsService } from './seminar-halls.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, RealtimeModule],
  providers: [SeminarHallsService],
  exports: [SeminarHallsService],
})
export class SeminarHallsModule { }
