require('dotenv').config();
const { PrismaClient, RiskLevel, RoleName } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const prisma = new PrismaClient();

let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const ids = {
  // Key Users
  admin: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222', // Mahesh Kumar Jena / Aditi Sharma (CSE 3A)
  student2: '44444444-4444-4444-8444-444444444444', // Rohit Panda (ECE 2A)
  student3: '44444444-4444-4444-8444-333333333333', // Ananya Mishra (CSE 3B)
  student4: '44444444-4444-4444-8444-555555555555', // Bikash Samal (ME 4A)
  student5: '44444444-4444-4444-8444-666666666666', // Priyanka Mohapatra (CSE 1A)
  
  staff: '33333333-3333-4333-8333-333333333333',   // Priya Das (Academic)
  staff2: '33333333-3333-4333-8333-444444444444',  // Sunita Sen (Exam)
  staff3: '33333333-3333-4333-8333-555555555555',  // Ramesh Sahoo (Accounts)
  
  fac1: '55555555-1111-4555-8555-111111111111',    // Dr. R. Nayak (Lab Incharge, CSE)
  fac2: '55555555-2222-4555-8555-222222222222',    // Dr. S. Mohanty (HOD, CSE)
  fac3: '55555555-3333-4555-8555-333333333333',    // Dr. A. K. Swain (ECE)
  fac4: '55555555-4444-4555-8555-444444444444',    // Dr. B. N. Mishra (MECH)
  
  warden: '66666666-6666-4666-8666-666666666666',  // Mr. K. Behera (Hostel Warden)

  // Departments
  deptCse: 'aaaaaaaa-aaaa-4aaa-8aaa-111111111111',
  deptEce: 'aaaaaaaa-aaaa-4aaa-8aaa-222222222222',
  deptMech: 'aaaaaaaa-aaaa-4aaa-8aaa-333333333333',
  deptCiv: 'aaaaaaaa-aaaa-4aaa-8aaa-666666666666',
  academicDept: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  deptExam: 'aaaaaaaa-aaaa-4aaa-8aaa-444444444444',
  financeDept: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  hostelDept: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  deptLib: 'aaaaaaaa-aaaa-4aaa-8aaa-555555555555',

  // Sections
  secCse3a: '77777777-7777-4777-8777-111111111111',
  secCse3b: '77777777-7777-4777-8777-222222222222',
  secCse1a: '77777777-7777-4777-8777-444444444444',
  secEce2a: '77777777-7777-4777-8777-333333333333',
  secMech4a: '77777777-7777-4777-8777-555555555555',

  // Subjects
  subCs301: '88888888-8888-4888-8888-111111111111', // Database Management Systems
  subCs305: '88888888-8888-4888-8888-222222222222', // Operating Systems Lab
  subCs302: '88888888-8888-4888-8888-444444444444', // Computer Networks
  subEc201: '88888888-8888-4888-8888-333333333333', // Signals & Systems
  subMe401: '88888888-8888-4888-8888-555555555555', // Heat & Mass Transfer

  // Labs & Halls
  labCseProg1: '55555555-5555-4555-8555-111111111111',
  labCseProg2: '55555555-5555-4555-8555-222222222222',
  labEceHw1: '55555555-5555-4555-8555-333333333333',
  labResource: '55555555-5555-4555-8555-555555555555', // Central computing lab
  hallMainAuditorium: '99999999-9999-4999-8999-111111111111',
  hallCseSeminar: '99999999-9999-4999-8999-222222222222',

  // Fee Structures
  feeCse3_5: '12121212-1212-4212-8212-111111111111',
  feeEce2_3: '12121212-1212-4212-8212-222222222222',
  feeMech4_7: '12121212-1212-4212-8212-333333333333',
  feeCse1_1: '12121212-1212-4212-8212-444444444444',
};

const files = [
  '01_Bonafide_Certificate_Policy_v2.md',
  '02_Hostel_Maintenance_SLA_Policy_v1.md',
  '03_Grievance_Redressal_Policy_v3.md',
  '04_Dept_Circular_Grievance_Handling_2021.md',
  '05_Lab_Booking_Policy_v1.md',
  '06_Fee_Refund_Policy_v1.md',
];

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const metadata = {};
  if (!match) return metadata;
  for (const line of match[1].split(/\r?\n/)) {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) continue;
    metadata[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
  }
  return metadata;
}

function chunkMarkdown(content) {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/, '').trim();
  return withoutFrontmatter
    .split(/\n(?=##\s+Clause\s+\d+)/i)
    .map((section, index) => ({
      clause: section.match(/^##\s+Clause\s+([^\n]+)/i)?.[1]?.trim() ?? (index === 0 ? 'Overview' : null),
      content: section.trim(),
      sourcePage: index + 1,
    }))
    .filter((chunk) => chunk.content.length > 0);
}

function localEmbedding(input) {
  const dims = 1536;
  const vector = Array.from({ length: dims }, () => 0);
  const terms = input
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\u0B00-\u0B7F ]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1);
  for (const term of terms) {
    let hash = 2166136261;
    for (const char of term) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % dims] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function passwordHash(password) {
  const salt = 'demo-seed-salt';
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function seedDepartments() {
  const depts = [
    { id: ids.deptCse, name: 'Computer Science & Engineering', code: 'CSE', type: 'academic' },
    { id: ids.deptEce, name: 'Electronics & Communication Engg', code: 'ECE', type: 'academic' },
    { id: ids.deptMech, name: 'Mechanical Engineering', code: 'MECH', type: 'academic' },
    { id: ids.deptCiv, name: 'Civil Engineering', code: 'CIVIL', type: 'academic' },
    { id: ids.academicDept, name: 'Academic Section', code: 'ACAD', type: 'administrative' },
    { id: ids.deptExam, name: 'Examination Section', code: 'EXAM', type: 'administrative' },
    { id: ids.financeDept, name: 'Accounts & Finance', code: 'ACC', type: 'administrative' },
    { id: ids.hostelDept, name: 'Hostel Administration', code: 'HOSTEL', type: 'hostel' },
    { id: ids.deptLib, name: 'Central Library', code: 'LIB', type: 'administrative' },
  ];
  for (const dept of depts) {
    await prisma.department.upsert({
      where: { id: dept.id },
      update: dept,
      create: dept,
    });
  }
}

async function seedUsers() {
  const users = [
    { id: ids.admin, name: 'Admin User', email: 'admin@svc.edu', role: RoleName.admin, departmentId: ids.academicDept },
    
    // Students
    { id: ids.student, name: 'Mahesh Kumar Jena', email: 'mahesh.jena@svc.edu', role: RoleName.student, departmentId: ids.deptCse },
    { id: ids.student2, name: 'Rohit Panda', email: 'rohit.panda@svc.edu', role: RoleName.student, departmentId: ids.deptEce },
    { id: ids.student3, name: 'Ananya Mishra', email: 'ananya.mishra@svc.edu', role: RoleName.student, departmentId: ids.deptCse },
    { id: ids.student4, name: 'Bikash Samal', email: 'bikash.samal@svc.edu', role: RoleName.student, departmentId: ids.deptMech },
    { id: ids.student5, name: 'Priyanka Mohapatra', email: 'priyanka.m@svc.edu', role: RoleName.student, departmentId: ids.deptCse },

    // Staff
    { id: ids.staff, name: 'Priya Das', email: 'priya.das@svc.edu', role: RoleName.staff, departmentId: ids.academicDept },
    { id: ids.staff2, name: 'Sunita Sen', email: 'sunita.sen@svc.edu', role: RoleName.staff, departmentId: ids.deptExam },
    { id: ids.staff3, name: 'Ramesh Sahoo', email: 'ramesh.sahoo@svc.edu', role: RoleName.staff, departmentId: ids.financeDept },

    // Faculty
    { id: ids.fac1, name: 'Dr. R. Nayak', email: 'r.nayak@svc.edu', role: RoleName.lab_incharge, departmentId: ids.deptCse },
    { id: ids.fac2, name: 'Dr. S. Mohanty', email: 's.mohanty@svc.edu', role: RoleName.staff, departmentId: ids.deptCse },
    { id: ids.fac3, name: 'Dr. A. K. Swain', email: 'ak.swain@svc.edu', role: RoleName.staff, departmentId: ids.deptEce },
    { id: ids.fac4, name: 'Dr. B. N. Mishra', email: 'bn.mishra@svc.edu', role: RoleName.staff, departmentId: ids.deptMech },

    // Warden
    { id: ids.warden, name: 'Mr. K. Behera', email: 'k.behera@svc.edu', role: RoleName.warden, departmentId: ids.hostelDept },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { ...user, passwordHash: passwordHash('Password123!') },
      create: { ...user, passwordHash: passwordHash('Password123!'), preferredLanguage: 'en' },
    });
  }
}

async function seedSectionsAndAcademicDetails() {
  const sections = [
    { id: ids.secCse3a, departmentId: ids.deptCse, name: 'A', year: 3, semester: 5, batchLabel: 'CSE-3A', strength: 62 },
    { id: ids.secCse3b, departmentId: ids.deptCse, name: 'B', year: 3, semester: 5, batchLabel: 'CSE-3B', strength: 58 },
    { id: ids.secCse1a, departmentId: ids.deptCse, name: 'A', year: 1, semester: 1, batchLabel: 'CSE-1A', strength: 60 },
    { id: ids.secEce2a, departmentId: ids.deptEce, name: 'A', year: 2, semester: 3, batchLabel: 'ECE-2A', strength: 54 },
    { id: ids.secMech4a, departmentId: ids.deptMech, name: 'A', year: 4, semester: 7, batchLabel: 'ME-4A', strength: 48 },
  ];
  for (const sec of sections) {
    await prisma.section.upsert({
      where: { id: sec.id },
      update: sec,
      create: sec,
    });
  }

  // Students Table Population
  const studentRecords = [
    {
      userId: ids.student,
      registrationNo: '21CSE1042',
      rollNo: 'CSE3A-14',
      sectionId: ids.secCse3a,
      admissionYear: 2021,
      status: 'active',
      guardianName: 'Ramesh Sharma',
      guardianPhone: '+919876543210',
    },
    {
      userId: ids.student2,
      registrationNo: '22ECE1005',
      rollNo: 'ECE2A-05',
      sectionId: ids.secEce2a,
      admissionYear: 2022,
      status: 'active',
      guardianName: 'Suresh Panda',
      guardianPhone: '+919876543211',
    },
    {
      userId: ids.student3,
      registrationNo: '21CSE1089',
      rollNo: 'CSE3B-22',
      sectionId: ids.secCse3b,
      admissionYear: 2021,
      status: 'active',
      guardianName: 'Prakash Mishra',
      guardianPhone: '+919876543212',
    },
    {
      userId: ids.student4,
      registrationNo: '20MECH1012',
      rollNo: 'ME4A-08',
      sectionId: ids.secMech4a,
      admissionYear: 2020,
      status: 'active',
      guardianName: 'Niranjan Samal',
      guardianPhone: '+919876543213',
    },
    {
      userId: ids.student5,
      registrationNo: '24CSE1002',
      rollNo: 'CSE1A-02',
      sectionId: ids.secCse1a,
      admissionYear: 2024,
      status: 'active',
      guardianName: 'Manohar Mohapatra',
      guardianPhone: '+919876543214',
    },
  ];

  for (const stud of studentRecords) {
    await prisma.student.upsert({
      where: { userId: stud.userId },
      update: stud,
      create: stud,
    });
  }

  // Faculty Table Population
  const facultyRecords = [
    { userId: ids.fac1, employeeId: 'EMP-CSE-011', departmentId: ids.deptCse, designation: 'Assistant Professor', isLabIncharge: true, isHod: false },
    { userId: ids.fac2, employeeId: 'EMP-CSE-002', departmentId: ids.deptCse, designation: 'Professor', isLabIncharge: false, isHod: true },
    { userId: ids.fac3, employeeId: 'EMP-ECE-005', departmentId: ids.deptEce, designation: 'Associate Professor', isLabIncharge: true, isHod: false },
    { userId: ids.fac4, employeeId: 'EMP-MECH-001', departmentId: ids.deptMech, designation: 'Professor', isLabIncharge: false, isHod: true },
  ];

  for (const fac of facultyRecords) {
    await prisma.faculty.upsert({
      where: { userId: fac.userId },
      update: fac,
      create: fac,
    });
  }

  // Update HOD links on Departments
  await prisma.department.update({ where: { id: ids.deptCse }, data: { hodUserId: ids.fac2 } });
  await prisma.department.update({ where: { id: ids.deptMech }, data: { hodUserId: ids.fac4 } });

  // Subjects
  const subjects = [
    { id: ids.subCs301, departmentId: ids.deptCse, code: 'CS301', name: 'Database Management Systems', semester: 5, requiresLab: true },
    { id: ids.subCs305, departmentId: ids.deptCse, code: 'CS305', name: 'Operating Systems Lab', semester: 5, requiresLab: true },
    { id: ids.subCs302, departmentId: ids.deptCse, code: 'CS302', name: 'Computer Networks', semester: 5, requiresLab: false },
    { id: ids.subEc201, departmentId: ids.deptEce, code: 'EC201', name: 'Signals & Systems', semester: 3, requiresLab: false },
    { id: ids.subMe401, departmentId: ids.deptMech, code: 'ME401', name: 'Heat & Mass Transfer', semester: 7, requiresLab: true },
  ];
  for (const sub of subjects) {
    await prisma.subject.upsert({
      where: { id: sub.id },
      update: sub,
      create: sub,
    });
  }

  // Section Subject Faculty links
  const links = [
    { id: '13131313-1313-4313-8313-111111111111', sectionId: ids.secCse3a, subjectId: ids.subCs305, facultyId: ids.fac1 },
    { id: '13131313-1313-4313-8313-222222222222', sectionId: ids.secCse3a, subjectId: ids.subCs301, facultyId: ids.fac2 },
    { id: '13131313-1313-4313-8313-333333333333', sectionId: ids.secEce2a, subjectId: ids.subEc201, facultyId: ids.fac3 },
  ];
  for (const link of links) {
    await prisma.sectionSubjectFaculty.upsert({
      where: { id: link.id },
      update: link,
      create: link,
    });
  }
}

async function seedRequestTypes() {
  const types = [
    { name: 'certificate', defaultRiskLevel: RiskLevel.high, defaultSlaHours: 72 },
    { name: 'maintenance', defaultRiskLevel: RiskLevel.low, defaultSlaHours: 48 },
    { name: 'lab_booking', defaultRiskLevel: RiskLevel.low, defaultSlaHours: 24 },
    { name: 'grievance', defaultRiskLevel: RiskLevel.high, defaultSlaHours: 168 },
    { name: 'general_query', defaultRiskLevel: RiskLevel.low, defaultSlaHours: 72 },
    { name: 'fee_receipt', defaultRiskLevel: RiskLevel.low, defaultSlaHours: 24 },
    { name: 'transcript_request', defaultRiskLevel: RiskLevel.high, defaultSlaHours: 120 },
    { name: 'hostel_maintenance', defaultRiskLevel: RiskLevel.low, defaultSlaHours: 48 },
    { name: 'library_noc', defaultRiskLevel: RiskLevel.medium, defaultSlaHours: 48 },
  ];
  for (const type of types) {
    await prisma.requestType.upsert({ where: { name: type.name }, update: type, create: type });
  }
}

async function seedLabsAndSeminarHalls() {
  const labs = [
    { id: ids.labCseProg1, name: 'CSE Programming Lab 1', departmentId: ids.deptCse, capacity: 60, labType: 'programming', labInchargeId: ids.fac1, location: 'CS Block, 2nd Floor' },
    { id: ids.labCseProg2, name: 'CSE Programming Lab 2', departmentId: ids.deptCse, capacity: 60, labType: 'programming', labInchargeId: ids.fac1, location: 'CS Block, 2nd Floor' },
    { id: ids.labEceHw1, name: 'ECE Hardware Lab', departmentId: ids.deptEce, capacity: 40, labType: 'hardware', labInchargeId: ids.fac3, location: 'ECE Block, 1st Floor' },
    { id: ids.labResource, name: 'Central Computing Lab', departmentId: null, capacity: 40, restrictions: 'Course code or faculty reference required.', location: 'Main Block, Ground Floor' },
  ];

  for (const lab of labs) {
    await prisma.labResource.upsert({
      where: { id: lab.id },
      update: lab,
      create: lab,
    });
  }

  const halls = [
    { id: ids.hallMainAuditorium, name: 'Main Auditorium', departmentId: null, capacity: 400, hasProjector: true, hasAc: true, location: 'Admin Block' },
    { id: ids.hallCseSeminar, name: 'CSE Seminar Hall', departmentId: ids.deptCse, capacity: 80, hasProjector: true, hasAc: true, location: 'CS Block, 3rd Floor' },
  ];

  for (const hall of halls) {
    await prisma.seminarHall.upsert({
      where: { id: hall.id },
      update: hall,
      create: hall,
    });
  }
}

async function seedAdministrativeRecords() {
  // Fee Structures across departments & years
  const feeStructures = [
    { id: ids.feeCse3_5, departmentId: ids.deptCse, year: 3, semester: 5, tuitionFee: 75000, hostelFee: 10000, examFee: 2000, dueDate: new Date('2026-07-31') },
    { id: ids.feeCse1_1, departmentId: ids.deptCse, year: 1, semester: 1, tuitionFee: 80000, hostelFee: 10000, examFee: 2000, dueDate: new Date('2026-08-15') },
    { id: ids.feeEce2_3, departmentId: ids.deptEce, year: 2, semester: 3, tuitionFee: 70000, hostelFee: 10000, examFee: 2000, dueDate: new Date('2026-07-31') },
    { id: ids.feeMech4_7, departmentId: ids.deptMech, year: 4, semester: 7, tuitionFee: 65000, hostelFee: 10000, examFee: 2000, dueDate: new Date('2026-07-31') },
  ];

  for (const struct of feeStructures) {
    await prisma.feeStructure.upsert({
      where: { id: struct.id },
      update: struct,
      create: struct,
    });
  }

  // Fee Payments (covering paid, partial, unpaid scenarios)
  const payments = [
    {
      id: '14141414-1414-4414-8414-111111111111',
      studentId: ids.student,
      feeStructureId: ids.feeCse3_5,
      amountPaid: 87000,
      paymentStatus: 'paid',
      paymentDate: new Date('2026-07-10T00:00:00Z'),
      receiptNo: 'RCPT-2026-084521',
      paymentMode: 'online',
    },
    {
      id: '14141414-1414-4414-8414-222222222222',
      studentId: ids.student2,
      feeStructureId: ids.feeEce2_3,
      amountPaid: 25000,
      paymentStatus: 'partial',
      paymentDate: new Date('2026-07-15T00:00:00Z'),
      receiptNo: 'RCPT-2026-003112',
      paymentMode: 'dd',
    },
    {
      id: '14141414-1414-4414-8414-333333333333',
      studentId: ids.student3,
      feeStructureId: ids.feeCse3_5,
      amountPaid: 0,
      paymentStatus: 'unpaid',
      paymentDate: null,
      receiptNo: null,
      paymentMode: null,
    },
    {
      id: '14141414-1414-4414-8414-444444444444',
      studentId: ids.student4,
      feeStructureId: ids.feeMech4_7,
      amountPaid: 77000,
      paymentStatus: 'paid',
      paymentDate: new Date('2026-07-05T00:00:00Z'),
      receiptNo: 'RCPT-2026-001290',
      paymentMode: 'online',
    },
  ];

  for (const pay of payments) {
    await prisma.feePayment.upsert({
      where: { id: pay.id },
      update: pay,
      create: pay,
    });
  }

  // Exam Records
  const examRecords = [
    { id: '15151515-1515-4515-8515-111111111111', studentId: ids.student, subjectId: ids.subCs301, examType: 'mid_sem', marksObtained: 38, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
    { id: '15151515-1515-4515-8515-222222222222', studentId: ids.student, subjectId: ids.subCs305, examType: 'mid_sem', marksObtained: 45, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
    { id: '15151515-1515-4515-8515-333333333333', studentId: ids.student, subjectId: ids.subCs302, examType: 'mid_sem', marksObtained: 42, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
    { id: '15151515-1515-4515-8515-444444444444', studentId: ids.student2, subjectId: ids.subEc201, examType: 'mid_sem', marksObtained: 28, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
    { id: '15151515-1515-4515-8515-555555555555', studentId: ids.student3, subjectId: ids.subCs301, examType: 'mid_sem', marksObtained: 46, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
  ];

  for (const exam of examRecords) {
    await prisma.examRecord.upsert({
      where: { id: exam.id },
      update: exam,
      create: exam,
    });
  }

  // Hostel Allocations
  const hostelAllocations = [
    { id: '16161616-1616-4616-8616-111111111111', studentId: ids.student, hostelBlock: 'Block C', roomNo: '304', wardenId: ids.warden, status: 'active', allocatedAt: new Date('2026-07-01') },
    { id: '16161616-1616-4616-8616-222222222222', studentId: ids.student2, hostelBlock: 'Block A', roomNo: '108', wardenId: ids.warden, status: 'active', allocatedAt: new Date('2026-07-01') },
    { id: '16161616-1616-4616-8616-333333333333', studentId: ids.student3, hostelBlock: 'Block B', roomNo: '212', wardenId: ids.warden, status: 'active', allocatedAt: new Date('2026-07-01') },
    { id: '16161616-1616-4616-8616-444444444444', studentId: ids.student4, hostelBlock: 'Block D', roomNo: '401', wardenId: ids.warden, status: 'active', allocatedAt: new Date('2025-07-01') },
  ];

  for (const alloc of hostelAllocations) {
    await prisma.hostelAllocation.upsert({
      where: { id: alloc.id },
      update: alloc,
      create: alloc,
    });
  }

  // Library Records
  const libraryRecords = [
    { id: '17171717-1717-4717-8717-111111111111', studentId: ids.student, bookTitle: 'Database System Concepts 7th Ed', issuedAt: new Date('2026-08-01'), dueDate: new Date('2026-08-25'), returnedAt: null, fineAmount: 0 },
    { id: '17171717-1717-4717-8717-222222222222', studentId: ids.student3, bookTitle: 'Operating System Concepts 10th Ed', issuedAt: new Date('2026-07-10'), dueDate: new Date('2026-08-01'), returnedAt: null, fineAmount: 50 },
    { id: '17171717-1717-4717-8717-333333333333', studentId: ids.student4, bookTitle: 'Heat & Mass Transfer Fundamentals', issuedAt: new Date('2026-08-05'), dueDate: new Date('2026-08-30'), returnedAt: null, fineAmount: 0 },
  ];

  for (const lib of libraryRecords) {
    await prisma.libraryRecord.upsert({
      where: { id: lib.id },
      update: lib,
      create: lib,
    });
  }

  // Sample Grievances
  const grievances = [
    {
      id: '18181818-1818-4818-8818-111111111111',
      ownerUserId: ids.student,
      userId: ids.student,
      category: 'academic_evaluation',
      description: 'Requesting re-evaluation of CS301 Database Management Systems mid-sem paper due to total mismatch.',
      anonymous: false,
      status: 'open',
      escalationLevel: 1,
      slaDueAt: new Date('2026-08-28T00:00:00Z'),
    },
    {
      id: '18181818-1818-4818-8818-222222222222',
      ownerUserId: ids.student2,
      userId: ids.student2,
      category: 'hostel_maintenance',
      description: 'AC in Block A room 108 is not cooling and leaking water continuously.',
      anonymous: false,
      status: 'open',
      escalationLevel: 1,
      slaDueAt: new Date('2026-08-23T00:00:00Z'),
    },
  ];

  for (const g of grievances) {
    await prisma.grievance.upsert({
      where: { id: g.id },
      update: g,
      create: g,
    });
  }
}

async function getEmbeddings(texts) {
  if (openaiClient && texts.length > 0) {
    try {
      const response = await openaiClient.embeddings.create({
        model: process.env.LLM_TIER_D_MODEL || 'text-embedding-3-small',
        input: texts,
      });
      console.log(`  [OpenAI Embedding] Successfully generated ${response.data.length} embeddings via text-embedding-3-small`);
      return response.data.map((d) => d.embedding);
    } catch (err) {
      console.warn(`  [OpenAI Embedding Warning] ${err.message}. Falling back to local hash embeddings.`);
    }
  }
  return texts.map((t) => localEmbedding(t));
}

async function seedKnowledgeBase() {
  const base = process.env.SEED_KB_DIR || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads', 'files');
  console.log(`[Seed Knowledge Base] Reading policy files from: ${base}`);

  for (const file of files) {
    const fullPath = path.join(base, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ Warning: Policy file not found: ${fullPath}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const meta = parseFrontmatter(content);
    const document = await prisma.knowledgeDocument.upsert({
      where: { documentId_version: { documentId: meta.document_id, version: meta.version } },
      update: {
        title: meta.document_title,
        uploadedBy: ids.admin,
        fileUrl: fullPath,
        status: meta.status?.startsWith('active') ? 'active' : meta.status || 'active',
        effectiveDate: meta.effective_date ? new Date(meta.effective_date) : null,
      },
      create: {
        title: meta.document_title,
        documentId: meta.document_id,
        version: meta.version,
        uploadedBy: ids.admin,
        fileUrl: fullPath,
        status: meta.status?.startsWith('active') ? 'active' : meta.status || 'active',
        effectiveDate: meta.effective_date ? new Date(meta.effective_date) : null,
      },
    });

    await prisma.documentChunk.deleteMany({ where: { documentId: document.id } });
    const chunks = chunkMarkdown(content);
    console.log(`📄 Ingesting "${meta.document_title}" (${chunks.length} chunks)...`);

    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await getEmbeddings(chunkTexts);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const emb = embeddings[i];
      const created = await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          content: chunk.content,
          clause: chunk.clause,
          sourcePage: chunk.sourcePage,
        },
      });
      await prisma.$executeRawUnsafe(
        'UPDATE document_chunks SET embedding = $1::vector WHERE id = $2::uuid',
        `[${emb.join(',')}]`,
        created.id,
      );
    }
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS document_chunks_fts_idx ON document_chunks USING GIN (to_tsvector('english', content));`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS document_chunks_clause_fts_idx ON document_chunks USING GIN (to_tsvector('english', coalesce(clause, '')));`);
  console.log(`✅ Knowledge base vector ingestion complete!`);
}

async function main() {
  await seedDepartments();
  await seedUsers();
  await seedSectionsAndAcademicDetails();
  await seedRequestTypes();
  await seedLabsAndSeminarHalls();
  await seedAdministrativeRecords();
  await seedKnowledgeBase();
  console.log('🌱 Mock College Database Seed Complete!');
  console.log(`Student headers: x-user-id=${ids.student}; x-user-role=student; x-department-id=${ids.deptCse}`);
  console.log(`Staff headers: x-user-id=${ids.staff}; x-user-role=staff; x-department-id=${ids.academicDept}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
