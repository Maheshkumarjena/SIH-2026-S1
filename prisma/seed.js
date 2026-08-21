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
  admin: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222',
  student2: '44444444-4444-4444-8444-444444444444',
  staff: '33333333-3333-4333-8333-333333333333',
  fac1: '55555555-1111-4555-8555-111111111111',
  fac2: '55555555-2222-4555-8555-222222222222',
  warden: '66666666-6666-4666-8666-666666666666',
  
  deptCse: 'aaaaaaaa-aaaa-4aaa-8aaa-111111111111',
  deptEce: 'aaaaaaaa-aaaa-4aaa-8aaa-222222222222',
  deptMech: 'aaaaaaaa-aaaa-4aaa-8aaa-333333333333',
  academicDept: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  deptExam: 'aaaaaaaa-aaaa-4aaa-8aaa-444444444444',
  financeDept: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  hostelDept: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  deptLib: 'aaaaaaaa-aaaa-4aaa-8aaa-555555555555',
  
  secCse3a: '77777777-7777-4777-8777-111111111111',
  secCse3b: '77777777-7777-4777-8777-222222222222',
  secEce2a: '77777777-7777-4777-8777-333333333333',

  subCs301: '88888888-8888-4888-8888-111111111111',
  subCs305: '88888888-8888-4888-8888-222222222222',
  subEc201: '88888888-8888-4888-8888-333333333333',

  labCseProg1: '55555555-5555-4555-8555-111111111111',
  labCseProg2: '55555555-5555-4555-8555-222222222222',
  labEceHw1: '55555555-5555-4555-8555-333333333333',
  labResource: '55555555-5555-4555-8555-555555555555', // Central computing lab

  hallMainAuditorium: '99999999-9999-4999-8999-111111111111',
  hallCseSeminar: '99999999-9999-4999-8999-222222222222',

  feeCse3_5: '12121212-1212-4212-8212-111111111111',
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
    { id: ids.student, name: 'Aditi Sharma', email: 'aditi.sharma@svc.edu', role: RoleName.student, departmentId: ids.deptCse },
    { id: ids.student2, name: 'Rohit Panda', email: 'rohit.panda@svc.edu', role: RoleName.student, departmentId: ids.deptEce },
    { id: ids.staff, name: 'Priya Das', email: 'priya.das@svc.edu', role: RoleName.staff, departmentId: ids.academicDept },
    { id: ids.fac1, name: 'Dr. R. Nayak', email: 'r.nayak@svc.edu', role: RoleName.lab_incharge, departmentId: ids.deptCse },
    { id: ids.fac2, name: 'Dr. S. Mohanty', email: 's.mohanty@svc.edu', role: RoleName.staff, departmentId: ids.deptCse },
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
    { id: ids.secEce2a, departmentId: ids.deptEce, name: 'A', year: 2, semester: 3, batchLabel: 'ECE-2A', strength: 54 },
  ];
  for (const sec of sections) {
    await prisma.section.upsert({
      where: { id: sec.id },
      update: sec,
      create: sec,
    });
  }

  // Students
  await prisma.student.upsert({
    where: { userId: ids.student },
    update: { registrationNo: '21CSE1042', rollNo: 'CSE3A-14', sectionId: ids.secCse3a, admissionYear: 2021, status: 'active', guardianName: 'Ramesh Sharma', guardianPhone: '+919876543210' },
    create: { userId: ids.student, registrationNo: '21CSE1042', rollNo: 'CSE3A-14', sectionId: ids.secCse3a, admissionYear: 2021, status: 'active', guardianName: 'Ramesh Sharma', guardianPhone: '+919876543210' },
  });

  await prisma.student.upsert({
    where: { userId: ids.student2 },
    update: { registrationNo: '22ECE1005', rollNo: 'ECE2A-05', sectionId: ids.secEce2a, admissionYear: 2022, status: 'active', guardianName: 'Suresh Panda', guardianPhone: '+919876543211' },
    create: { userId: ids.student2, registrationNo: '22ECE1005', rollNo: 'ECE2A-05', sectionId: ids.secEce2a, admissionYear: 2022, status: 'active', guardianName: 'Suresh Panda', guardianPhone: '+919876543211' },
  });

  // Faculty
  await prisma.faculty.upsert({
    where: { userId: ids.fac1 },
    update: { employeeId: 'EMP-CSE-011', departmentId: ids.deptCse, designation: 'Assistant Professor', isLabIncharge: true, isHod: false },
    create: { userId: ids.fac1, employeeId: 'EMP-CSE-011', departmentId: ids.deptCse, designation: 'Assistant Professor', isLabIncharge: true, isHod: false },
  });

  await prisma.faculty.upsert({
    where: { userId: ids.fac2 },
    update: { employeeId: 'EMP-CSE-002', departmentId: ids.deptCse, designation: 'Professor', isLabIncharge: false, isHod: true },
    create: { userId: ids.fac2, employeeId: 'EMP-CSE-002', departmentId: ids.deptCse, designation: 'Professor', isLabIncharge: false, isHod: true },
  });

  // Update HOD link on Department
  await prisma.department.update({
    where: { id: ids.deptCse },
    data: { hodUserId: ids.fac2 },
  });

  // Subjects
  const subjects = [
    { id: ids.subCs301, departmentId: ids.deptCse, code: 'CS301', name: 'Database Management Systems', semester: 5, requiresLab: true },
    { id: ids.subCs305, departmentId: ids.deptCse, code: 'CS305', name: 'Operating Systems Lab', semester: 5, requiresLab: true },
    { id: ids.subEc201, departmentId: ids.deptEce, code: 'EC201', name: 'Signals & Systems', semester: 3, requiresLab: false },
  ];
  for (const sub of subjects) {
    await prisma.subject.upsert({
      where: { id: sub.id },
      update: sub,
      create: sub,
    });
  }

  // Section Subject Faculty link
  const linkId = '13131313-1313-4313-8313-111111111111';
  await prisma.sectionSubjectFaculty.upsert({
    where: { id: linkId },
    update: { sectionId: ids.secCse3a, subjectId: ids.subCs305, facultyId: ids.fac1 },
    create: { id: linkId, sectionId: ids.secCse3a, subjectId: ids.subCs305, facultyId: ids.fac1 },
  });
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
    { id: ids.labEceHw1, name: 'ECE Hardware Lab', departmentId: ids.deptEce, capacity: 40, labType: 'hardware', labInchargeId: ids.fac1, location: 'ECE Block, 1st Floor' },
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
  // Fee Structure & Payments
  await prisma.feeStructure.upsert({
    where: { id: ids.feeCse3_5 },
    update: { departmentId: ids.deptCse, year: 3, semester: 5, tuitionFee: 75000, hostelFee: 10000, examFee: 2000, dueDate: new Date('2026-07-31') },
    create: { id: ids.feeCse3_5, departmentId: ids.deptCse, year: 3, semester: 5, tuitionFee: 75000, hostelFee: 10000, examFee: 2000, dueDate: new Date('2026-07-31') },
  });

  const pay1Id = '14141414-1414-4414-8414-111111111111';
  await prisma.feePayment.upsert({
    where: { id: pay1Id },
    update: { studentId: ids.student, feeStructureId: ids.feeCse3_5, amountPaid: 87000, paymentStatus: 'paid', paymentDate: new Date('2026-07-10T00:00:00Z'), receiptNo: 'RCPT-2026-004521', paymentMode: 'online' },
    create: { id: pay1Id, studentId: ids.student, feeStructureId: ids.feeCse3_5, amountPaid: 87000, paymentStatus: 'paid', paymentDate: new Date('2026-07-10T00:00:00Z'), receiptNo: 'RCPT-2026-004521', paymentMode: 'online' },
  });

  const pay2Id = '14141414-1414-4414-8414-222222222222';
  await prisma.feePayment.upsert({
    where: { id: pay2Id },
    update: { studentId: ids.student2, feeStructureId: ids.feeCse3_5, amountPaid: 0, paymentStatus: 'unpaid', paymentDate: null, receiptNo: null, paymentMode: null },
    create: { id: pay2Id, studentId: ids.student2, feeStructureId: ids.feeCse3_5, amountPaid: 0, paymentStatus: 'unpaid', paymentDate: null, receiptNo: null, paymentMode: null },
  });

  // Exam Records
  const exam1Id = '15151515-1515-4515-8515-111111111111';
  await prisma.examRecord.upsert({
    where: { id: exam1Id },
    update: { studentId: ids.student, subjectId: ids.subCs301, examType: 'mid_sem', marksObtained: 38, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
    create: { id: exam1Id, studentId: ids.student, subjectId: ids.subCs301, examType: 'mid_sem', marksObtained: 38, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
  });

  const exam2Id = '15151515-1515-4515-8515-222222222222';
  await prisma.examRecord.upsert({
    where: { id: exam2Id },
    update: { studentId: ids.student, subjectId: ids.subCs305, examType: 'mid_sem', marksObtained: 45, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
    create: { id: exam2Id, studentId: ids.student, subjectId: ids.subCs305, examType: 'mid_sem', marksObtained: 45, maxMarks: 50, status: 'published', publishedAt: new Date('2026-08-01T00:00:00Z') },
  });

  // Hostel Allocation
  const alloc1Id = '16161616-1616-4616-8616-111111111111';
  await prisma.hostelAllocation.upsert({
    where: { id: alloc1Id },
    update: { studentId: ids.student, hostelBlock: 'Block C', roomNo: '304', wardenId: ids.warden, status: 'active', allocatedAt: new Date('2026-07-01') },
    create: { id: alloc1Id, studentId: ids.student, hostelBlock: 'Block C', roomNo: '304', wardenId: ids.warden, status: 'active', allocatedAt: new Date('2026-07-01') },
  });

  // Library Record
  const lib1Id = '17171717-1717-4717-8717-111111111111';
  await prisma.libraryRecord.upsert({
    where: { id: lib1Id },
    update: { studentId: ids.student, bookTitle: 'Database System Concepts 7th Ed', issuedAt: new Date('2026-08-01'), dueDate: new Date('2026-08-25'), returnedAt: null, fineAmount: 0 },
    create: { id: lib1Id, studentId: ids.student, bookTitle: 'Database System Concepts 7th Ed', issuedAt: new Date('2026-08-01'), dueDate: new Date('2026-08-25'), returnedAt: null, fineAmount: 0 },
  });
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
  console.log('Seed complete');
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
