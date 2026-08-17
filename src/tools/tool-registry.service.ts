import { Injectable } from '@nestjs/common';
import { AgentTool, ToolExecutionContext } from './tool.types';
import { CertificateService } from '../certificates/certificate.service';
import { RequestsService } from '../requests/requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LabBookingsService } from '../lab-bookings/lab-bookings.service';
import { GrievancesService } from '../grievances/grievances.service';

@Injectable()
export class ToolRegistryService {
  private readonly tools: Map<string, AgentTool>;

  constructor(
    private readonly requests: RequestsService,
    private readonly notifications: NotificationsService,
    private readonly labBookings: LabBookingsService,
    private readonly grievances: GrievancesService,
    private readonly certificates: CertificateService,
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
          name: 'check_lab_availability',
          description: 'Check whether a lab slot appears available',
          riskLevel: 'low',
          inputSchema: this.objectSchema(['resource_id', 'start_time', 'end_time']),
          allowedRoles: [...roles],
          execute: async (args: Record<string, unknown>) => {
            const date = String(args.start_time).slice(0, 10);
            const bookings = await this.labBookings.listForDate(String(args.resource_id), date);
            return {
              available: !bookings.items.some(
                (booking: { status: string; startTime: Date; endTime: Date }) =>
                  booking.status === 'confirmed' &&
                  booking.startTime < new Date(String(args.end_time)) &&
                  booking.endTime > new Date(String(args.start_time)),
              ),
            };
          },
        },
        {
          name: 'book_lab_slot',
          description: 'Book a lab slot through the controlled booking service',
          riskLevel: 'low',
          inputSchema: this.objectSchema(['resource_id', 'start_time', 'end_time'], ['course_code', 'faculty_ref']),
          allowedRoles: [...roles],
          execute: async (args: Record<string, unknown>, context: ToolExecutionContext) =>
            this.labBookings.book(context.user, {
              resource_id: String(args.resource_id),
              start_time: String(args.start_time),
              end_time: String(args.end_time),
              course_code: typeof args.course_code === 'string' ? args.course_code : undefined,
              faculty_ref: typeof args.faculty_ref === 'string' ? args.faculty_ref : undefined,
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
          description: 'Escalate a grievance to the next authority',
          riskLevel: 'high',
          inputSchema: this.objectSchema(['grievance_id', 'reason']),
          allowedRoles: ['staff', 'admin', 'warden'],
          execute: async (args: Record<string, unknown>, context: ToolExecutionContext) => this.grievances.escalate(String(args.grievance_id), context.user),
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
      additionalProperties: false,
      properties: Object.fromEntries(keys.map((key) => [key, { type: 'string', minLength: 1 }])),
    };
  }
}
