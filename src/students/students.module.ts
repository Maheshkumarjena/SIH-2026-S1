import { Module } from '@nestjs/common';
import { StudentRecordsService } from './student-records.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [StudentRecordsService],
  exports: [StudentRecordsService],
})
export class StudentsModule { }
