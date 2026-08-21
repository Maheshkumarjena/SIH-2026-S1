import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StudentRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentProfile(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true, role: true } },
        section: {
          include: {
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Student profile not found' });
    }

    return {
      userId: student.userId,
      name: student.user.name,
      email: student.user.email,
      registrationNo: student.registrationNo,
      rollNo: student.rollNo,
      batchLabel: student.section.batchLabel,
      year: student.section.year,
      semester: student.section.semester,
      departmentId: student.section.department.id,
      departmentName: student.section.department.name,
      departmentCode: student.section.department.code,
      admissionYear: student.admissionYear,
      status: student.status,
    };
  }

  async getAnnualFeeSummary(userId: string, targetYear?: number) {
    const student = await this.getStudentProfile(userId);
    const academicYear = targetYear ?? student.year;

    // Find fee structures for the department and target year
    let structures = await this.prisma.feeStructure.findMany({
      where: {
        departmentId: student.departmentId,
        year: academicYear,
      },
    });

    // Fallback if specific year structure is missing: get all department fee structures
    if (structures.length === 0) {
      structures = await this.prisma.feeStructure.findMany({
        where: { departmentId: student.departmentId },
      });
    }

    let totalTuition = 0;
    let totalHostel = 0;
    let totalExam = 0;

    for (const struct of structures) {
      totalTuition += Number(struct.tuitionFee);
      totalHostel += struct.hostelFee ? Number(struct.hostelFee) : 0;
      totalExam += Number(struct.examFee);
    }

    const totalAnnualScheduledFee = totalTuition + totalHostel + totalExam;

    // Find all payments made by this student
    const payments = await this.prisma.feePayment.findMany({
      where: { studentId: userId },
    });

    const totalAmountPaid = payments.reduce((sum, p) => sum + Number(p.amountPaid), 0);
    const outstandingBalance = Math.max(0, totalAnnualScheduledFee - totalAmountPaid);
    const isFullyPaid = outstandingBalance <= 0;

    return {
      student,
      academicYear,
      totalTuitionFee: totalTuition,
      totalHostelFee: totalHostel,
      totalExamFee: totalExam,
      totalAnnualScheduledFee,
      totalAmountPaid,
      outstandingBalance,
      isFullyPaid,
      paymentStatus: isFullyPaid ? 'paid' : totalAmountPaid > 0 ? 'partial' : 'unpaid',
      recentReceiptNo: payments.find((p) => p.receiptNo)?.receiptNo ?? null,
    };
  }

  async getFeeStatus(userId: string) {
    const student = await this.getStudentProfile(userId);
    const payments = await this.prisma.feePayment.findMany({
      where: { studentId: userId },
      include: {
        feeStructure: true,
      },
      orderBy: { paymentDate: 'desc' },
    });

    const annualSummary = await this.getAnnualFeeSummary(userId);

    return {
      student,
      annualSummary,
      payments: payments.map((p) => ({
        id: p.id,
        feeStructureId: p.feeStructureId,
        semester: p.feeStructure.semester,
        year: p.feeStructure.year,
        tuitionFee: Number(p.feeStructure.tuitionFee),
        examFee: Number(p.feeStructure.examFee),
        hostelFee: p.feeStructure.hostelFee ? Number(p.feeStructure.hostelFee) : 0,
        amountPaid: Number(p.amountPaid),
        paymentStatus: p.paymentStatus,
        paymentDate: p.paymentDate,
        receiptNo: p.receiptNo,
        paymentMode: p.paymentMode,
        dueDate: p.feeStructure.dueDate,
      })),
    };
  }

  async getExamRecords(userId: string, courseCode?: string) {
    const student = await this.getStudentProfile(userId);
    
    let whereClause: any = { studentId: userId };
    if (courseCode) {
      const subject = await this.prisma.subject.findUnique({ where: { code: courseCode } });
      if (subject) {
        whereClause.subjectId = subject.id;
      }
    }

    const records = await this.prisma.examRecord.findMany({
      where: whereClause,
      include: {
        subject: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    return {
      student,
      examRecords: records.map((r) => ({
        id: r.id,
        subjectCode: r.subject.code,
        subjectName: r.subject.name,
        examType: r.examType,
        marksObtained: r.marksObtained !== null ? Number(r.marksObtained) : null,
        maxMarks: Number(r.maxMarks),
        status: r.status,
        publishedAt: r.publishedAt,
      })),
    };
  }
}
