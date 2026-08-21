import { Injectable } from '@nestjs/common';
import { AgentTool, ToolExecutionContext } from './tool.types';
import { CertificateService } from '../certificates/certificate.service';
import { RequestsService } from '../requests/requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LabBookingsService } from '../lab-bookings/lab-bookings.service';
import { GrievancesService } from '../grievances/grievances.service';
import { StudentRecordsService } from '../students/student-records.service';
import { SeminarHallsService } from '../seminar-halls/seminar-halls.service';

@Injectable()
export class ToolRegistryService {
  private readonly tools: Map<string, AgentTool>;

  constructor(
    private readonly requests: RequestsService,
    private readonly notifications: NotificationsService,
    private readonly labBookings: LabBookingsService,
    private readonly grievances: GrievancesService,
    private readonly certificates: CertificateService,
    private readonly studentRecords: StudentRecordsService,
    private readonly seminarHalls: SeminarHallsService,
  ) {
    const roles = ['student', 'staff', 'admin', 'warden', 'lab_incharge'] as const;
    const definitions: AgentTool[] = [
      {
        name: 'create_request',
        description: 'Create a tracked campus service request',
        riskLevel: 'low',
        inputSchema: this.objectSchema(['request_type', 'description'], ['department_id', 'session_id', 'request_id']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
          if (typeof args.request_id === 'string') {
            return this.requests.get(args.request_id);
          }
          return this.requests.create(context.user.id, {
            request_type: String(args.request_type),
            description: String(args.description),
            department_id: typeof args.department_id === 'string' ? args.department_id : context.user.department_id,
            session_id: context.session_id,
          });
        },
      },
      {
        name: 'get_student_profile',
        description: 'Get academic student profile details including registration number, section, and department',
        riskLevel: 'low',
        inputSchema: this.objectSchema([], ['user_id']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
          const targetUserId = typeof args.user_id === 'string' ? args.user_id : context.user.id;
          return this.studentRecords.getStudentProfile(targetUserId);
        },
      },
      {
        name: 'check_fee_status',
        description: 'Check student fee payment records, paid status, dues, and receipt details',
        riskLevel: 'low',
        inputSchema: this.objectSchema([], ['user_id']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
          const targetUserId = typeof args.user_id === 'string' ? args.user_id : context.user.id;
          return this.studentRecords.getFeeStatus(targetUserId);
        },
      },
      {
        name: 'get_annual_fee_summary',
        description: 'Get annual fee breakdown (tuition, hostel, exam, amount paid, outstanding balance) for education loans',
        riskLevel: 'low',
        inputSchema: this.objectSchema([], ['user_id', 'year']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
          const targetUserId = typeof args.user_id === 'string' ? args.user_id : context.user.id;
          const targetYear = typeof args.year === 'number' ? args.year : undefined;
          return this.studentRecords.getAnnualFeeSummary(targetUserId, targetYear);
        },
      },
      {
        name: 'get_exam_record',
        description: 'Get published student exam marks and evaluation status for a course or subject',
        riskLevel: 'low',
        inputSchema: this.objectSchema([], ['user_id', 'course_code']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
          const targetUserId = typeof args.user_id === 'string' ? args.user_id : context.user.id;
          const courseCode = typeof args.course_code === 'string' ? args.course_code : undefined;
          return this.studentRecords.getExamRecords(targetUserId, courseCode);
        },
      },
      {
        name: 'check_lab_availability',
        description: 'Check whether a lab slot is available',
        riskLevel: 'low',
        inputSchema: this.objectSchema(['resource_id', 'start_time', 'end_time']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>) => {
          let resourceId = String(args.resource_id);
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(resourceId)) {
            const resources = await this.labBookings.listResources(resourceId);
            if (resources.items.length > 0) {
              resourceId = resources.items[0].id;
            }
          }

          let start = new Date(String(args.start_time));
          let end = new Date(String(args.end_time));
          if (isNaN(start.getTime())) {
            start = new Date();
            start.setDate(start.getDate() + 1);
            start.setHours(10, 0, 0, 0);
          }
          if (isNaN(end.getTime())) {
            end = new Date(start);
            end.setHours(start.getHours() + 2);
          }

          const date = start.toISOString().slice(0, 10);
          const bookings = await this.labBookings.listForDate(resourceId, date);
          return {
            resource_id: resourceId,
            date,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            available: !bookings.items.some(
              (booking: { status: string; startTime: Date; endTime: Date }) =>
                booking.status === 'confirmed' &&
                booking.startTime < end &&
                booking.endTime > start,
            ),
          };
        },
      },
      {
        name: 'book_lab_slot',
        description: 'Book a lab slot through the controlled lab booking service',
        riskLevel: 'low',
        inputSchema: this.objectSchema(['resource_id', 'start_time', 'end_time'], ['course_code', 'faculty_ref', 'section_id']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) =>
          this.labBookings.book(context.user, {
            resource_id: String(args.resource_id),
            start_time: String(args.start_time),
            end_time: String(args.end_time),
            course_code: typeof args.course_code === 'string' ? args.course_code : undefined,
            faculty_ref: typeof args.faculty_ref === 'string' ? args.faculty_ref : undefined,
            section_id: typeof args.section_id === 'string' ? args.section_id : undefined,
          }),
      },
      {
        name: 'check_seminar_hall_availability',
        description: 'Check seminar hall / auditorium slot availability',
        riskLevel: 'low',
        inputSchema: this.objectSchema(['hall_id', 'start_time', 'end_time']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>) =>
          this.seminarHalls.checkAvailability(String(args.hall_id), String(args.start_time), String(args.end_time)),
      },
      {
        name: 'book_seminar_hall',
        description: 'Book a seminar hall or auditorium',
        riskLevel: 'medium',
        inputSchema: this.objectSchema(['hall_id', 'purpose', 'start_time', 'end_time']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) =>
          this.seminarHalls.book(context.user, {
            hall_id: String(args.hall_id),
            purpose: String(args.purpose),
            start_time: String(args.start_time),
            end_time: String(args.end_time),
          }),
      },
      {
        name: 'notify_department',
        description: 'Notify a department about a request',
        riskLevel: 'low',
        inputSchema: this.objectSchema(['request_id', 'department_id', 'message']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => {
          await this.notifications.create(context.user.id, {
            title: 'Department notified',
            body: String(args.message),
            deepLink: `/requests/${String(args.request_id)}`,
          });
          return { notified: true };
        },
      },
      {
        name: 'escalate_grievance',
        description: 'Escalate a grievance to the next authority level',
        riskLevel: 'high',
        inputSchema: this.objectSchema(['grievance_id', 'reason']),
        allowedRoles: ['staff', 'admin', 'warden'],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) =>
          this.grievances.escalate(String(args.grievance_id), context.user),
      },
      {
        name: 'issue_certificate',
        description: 'Issue an institutional certificate after approval',
        riskLevel: 'high',
        inputSchema: this.objectSchema(['request_id', 'certificate_type', 'purpose']),
        allowedRoles: ['staff', 'admin'],
        execute: async (args: Record<string, unknown>, context: ToolExecutionContext) =>
          this.certificates.issue({
            request_id: String(args.request_id),
            certificate_type: String(args.certificate_type),
            purpose: String(args.purpose),
            issued_by: context.user.id,
          }),
      },
      {
        name: 'render_certificate_document',
        description: 'Render printable bonafide / education loan certificate document payload with registrar verification block',
        riskLevel: 'low',
        inputSchema: this.objectSchema(['certificate_id']),
        allowedRoles: [...roles],
        execute: async (args: Record<string, unknown>) =>
          this.certificates.renderCertificateDocument(String(args.certificate_id)),
      },
    ];
    this.tools = new Map(definitions.map((tool) => [tool.name, tool]));
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  private objectSchema(required: string[], optional: string[] = []): Record<string, unknown> {
    const keys = [...required, ...optional];
    return {
      type: 'object',
      required,
      additionalProperties: true,
      properties: Object.fromEntries(
        keys.map((key) => [
          key,
          {
            anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
          },
        ]),
      ),
    };
  }
}
