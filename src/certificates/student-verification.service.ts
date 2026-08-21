import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface VerifiedStudentCertificateProfile {
  verified: true;
  student_id: string;
  name: string;
  department_id: string;
  department_name?: string;
  department_code?: string;
  registration_no?: string;
  roll_no?: string;
  batch_label?: string;
  year?: number;
  semester?: number;
  annual_scheduled_fee?: number;
  amount_paid?: number;
  outstanding_balance?: number;
  payment_status?: string;
}

@Injectable()
export class StudentVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyForCertificate(userId: string): Promise<VerifiedStudentCertificateProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: {
          include: {
            section: {
              include: {
                department: true,
              },
            },
            feePayments: {
              include: {
                feeStructure: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.role !== 'student') {
      throw new NotFoundException({ code: 'STUDENT_NOT_VERIFIED', message: 'Student record could not be verified' });
    }

    if (!user.student) {
      return {
        verified: true,
        student_id: user.id,
        name: user.name,
        department_id: user.departmentId,
      };
    }

    const studentRecord = user.student;
    const section = studentRecord.section;
    const dept = section.department;

    // Calculate annual fee breakdown
    const structures = await this.prisma.feeStructure.findMany({
      where: { departmentId: dept.id, year: section.year },
    });

    const annualScheduledFee = structures.reduce(
      (sum, s) => sum + Number(s.tuitionFee) + Number(s.examFee) + (s.hostelFee ? Number(s.hostelFee) : 0),
      0,
    );

    const totalPaid = studentRecord.feePayments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
    const outstanding = Math.max(0, annualScheduledFee - totalPaid);

    return {
      verified: true,
      student_id: user.id,
      name: user.name,
      department_id: dept.id,
      department_name: dept.name,
      department_code: dept.code,
      registration_no: studentRecord.registrationNo,
      roll_no: studentRecord.rollNo,
      batch_label: section.batchLabel,
      year: section.year,
      semester: section.semester,
      annual_scheduled_fee: annualScheduledFee,
      amount_paid: totalPaid,
      outstanding_balance: outstanding,
      payment_status: outstanding <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid',
    };
  }
}
