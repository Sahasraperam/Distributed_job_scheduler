import { PrismaClient, UserRole, RetryType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Dynamically hash the password 'password123'
  const PASSWORD_HASH = await bcrypt.hash('password123', 10);

  // 1. Create Retry Policies
  const fixedPolicy = await prisma.retryPolicy.upsert({
    where: { name: 'Default Fixed Retry' },
    update: {},
    create: {
      name: 'Default Fixed Retry',
      type: RetryType.FIXED,
      delayMs: 2000,
      maxAttempts: 3,
    },
  });

  const linearPolicy = await prisma.retryPolicy.upsert({
    where: { name: 'Default Linear Retry' },
    update: {},
    create: {
      name: 'Default Linear Retry',
      type: RetryType.LINEAR,
      delayMs: 1000,
      backoffFactor: 2.0,
      maxAttempts: 4,
    },
  });

  const exponentialPolicy = await prisma.retryPolicy.upsert({
    where: { name: 'Default Exponential Backoff' },
    update: {},
    create: {
      name: 'Default Exponential Backoff',
      type: RetryType.EXPONENTIAL,
      delayMs: 1000,
      backoffFactor: 2.0,
      maxAttempts: 5,
    },
  });

  console.log('Created retry policies.');

  // 2. Create Admin and Regular Users (updating passwords in upsert to ensure sync)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@codity.com' },
    update: {
      passwordHash: PASSWORD_HASH,
    },
    create: {
      email: 'admin@codity.com',
      passwordHash: PASSWORD_HASH,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { email: 'member@codity.com' },
    update: {
      passwordHash: PASSWORD_HASH,
    },
    create: {
      email: 'member@codity.com',
      passwordHash: PASSWORD_HASH,
      firstName: 'Member',
      lastName: 'User',
      role: UserRole.MEMBER,
    },
  });

  console.log('Created users.');

  // 3. Create Organization
  const orgCount = await prisma.organization.count();
  let org;
  if (orgCount === 0) {
    org = await prisma.organization.create({
      data: {
        name: 'codity Solutions',
        members: {
          create: [
            { userId: adminUser.id, role: UserRole.ADMIN },
            { userId: memberUser.id, role: UserRole.MEMBER },
          ],
        },
      },
    });
    console.log(`Created organization: ${org.name}`);
  } else {
    org = await prisma.organization.findFirst({
      include: { projects: true },
    });
    console.log(`Using existing organization: ${org?.name}`);
  }

  // 4. Create Project
  let project;
  if (org) {
    const projectCount = await prisma.project.count({ where: { organizationId: org.id } });
    if (projectCount === 0) {
      project = await prisma.project.create({
        data: {
          name: 'Production Task Scheduler',
          organizationId: org.id,
        },
      });
      console.log(`Created project: ${project.name}`);
    } else {
      project = await prisma.project.findFirst({ where: { organizationId: org.id } });
      console.log(`Using existing project: ${project?.name}`);
    }
  }

  // 5. Create Queues
  if (project) {
    const queues = [
      { name: 'default', concurrencyLimit: 10 },
      { name: 'critical', concurrencyLimit: 25 },
      { name: 'reports', concurrencyLimit: 2 },
      { name: 'webhooks', concurrencyLimit: 50 },
    ];

    for (const q of queues) {
      await prisma.queue.upsert({
        where: {
          projectId_name: {
            projectId: project.id,
            name: q.name,
          },
        },
        update: {
          concurrencyLimit: q.concurrencyLimit,
        },
        create: {
          name: q.name,
          concurrencyLimit: q.concurrencyLimit,
          projectId: project.id,
        },
      });
    }
    console.log('Synchronized queues.');
  }

  console.log('Database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
