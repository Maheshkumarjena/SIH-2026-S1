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
  staff: '33333333-3333-4333-8333-333333333333',
  academicDept: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  hostelDept: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  labDept: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  financeDept: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  labResource: '55555555-5555-4555-8555-555555555555',
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

async function seedUsers() {
  const users = [
    { id: ids.admin, name: 'Admin User', email: 'admin@soa.demo', role: RoleName.admin, departmentId: ids.academicDept },
    { id: ids.student, name: 'Test Student', email: 'student@soa.demo', role: RoleName.student, departmentId: ids.academicDept },
    { id: ids.staff, name: 'Academic Staff', email: 'staff@soa.demo', role: RoleName.staff, departmentId: ids.academicDept },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { ...user, passwordHash: passwordHash('Password123!') },
      create: { ...user, passwordHash: passwordHash('Password123!'), preferredLanguage: 'en' },
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
  ];
  for (const type of types) {
    await prisma.requestType.upsert({ where: { name: type.name }, update: type, create: type });
  }
}

async function seedLabResources() {
  await prisma.labResource.upsert({
    where: { id: ids.labResource },
    update: { name: 'Central Computing Lab', departmentId: ids.labDept, capacity: 40, restrictions: 'Course code or faculty reference required.' },
    create: { id: ids.labResource, name: 'Central Computing Lab', departmentId: ids.labDept, capacity: 40, restrictions: 'Course code or faculty reference required.' },
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
  await seedUsers();
  await seedRequestTypes();
  await seedLabResources();
  await seedKnowledgeBase();
  console.log('Seed complete');
  console.log(`Student headers: x-user-id=${ids.student}; x-user-role=student; x-department-id=${ids.academicDept}`);
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
