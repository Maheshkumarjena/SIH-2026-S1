import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StudentVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyForCertificate(userId: string): Promise<{ verified: true; student_id: string; name: string; department_id: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'student') {
      throw new NotFoundException({ code: 'STUDENT_NOT_VERIFIED', message: 'Student record could not be verified' });
    }
    return {
      verified: true,
      student_id: user.id,
      name: user.name,
      department_id: user.departmentId,
    };
  }
}
