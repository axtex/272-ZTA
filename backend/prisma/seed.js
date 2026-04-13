require("dotenv/config");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const devPassword = process.env.SEED_DEV_PASSWORD || "Password123!";
const devPasswordHash = bcrypt.hashSync(devPassword, 12);

async function main() {
  const doctorRole = await prisma.role.upsert({
    where: { roleName: "Doctor" },
    update: {},
    create: { roleName: "Doctor", description: "Doctor role" },
  });

  const nurseRole = await prisma.role.upsert({
    where: { roleName: "Nurse" },
    update: {},
    create: { roleName: "Nurse", description: "Nurse role" },
  });

  const adminRole = await prisma.role.upsert({
    where: { roleName: "Admin" },
    update: {},
    create: { roleName: "Admin", description: "Administrator role" },
  });

  const patientRole = await prisma.role.upsert({
    where: { roleName: "Patient" },
    update: {},
    create: { roleName: "Patient", description: "Patient role" },
  });

  const doctor1 = await prisma.user.upsert({
    where: { email: "john@hospital.com" },
    update: { passwordHash: devPasswordHash },
    create: {
      username: "dr_john",
      email: "john@hospital.com",
      passwordHash: devPasswordHash,
      roleId: doctorRole.id,
      mfaEnabled: true,
      status: "ACTIVE",
    },
  });

  const doctor2 = await prisma.user.upsert({
    where: { email: "karen@hospital.com" },
    update: { passwordHash: devPasswordHash },
    create: {
      username: "dr_karen",
      email: "karen@hospital.com",
      passwordHash: devPasswordHash,
      roleId: doctorRole.id,
      mfaEnabled: true,
      status: "ACTIVE",
    },
  });

  const nurse1 = await prisma.user.upsert({
    where: { email: "mary@hospital.com" },
    update: { passwordHash: devPasswordHash },
    create: {
      username: "nurse_mary",
      email: "mary@hospital.com",
      passwordHash: devPasswordHash,
      roleId: nurseRole.id,
      mfaEnabled: false,
      status: "ACTIVE",
    },
  });

  const nurse2 = await prisma.user.upsert({
    where: { email: "esha@hospital.com" },
    update: { passwordHash: devPasswordHash },
    create: {
      username: "nurse_esha",
      email: "esha@hospital.com",
      passwordHash: devPasswordHash,
      roleId: nurseRole.id,
      mfaEnabled: false,
      status: "ACTIVE",
    },
  });

  const admin1 = await prisma.user.upsert({
    where: { email: "emma@hospital.com" },
    update: { passwordHash: devPasswordHash },
    create: {
      username: "admin_emma",
      email: "emma@hospital.com",
      passwordHash: devPasswordHash,
      roleId: adminRole.id,
      mfaEnabled: true,
      status: "ACTIVE",
    },
  });

  const patientUsers = [];
  for (let i = 1; i <= 5; i++) {
    const patientUser = await prisma.user.upsert({
      where: { email: `patient${i}@hospital.com` },
      update: { passwordHash: devPasswordHash },
      create: {
        username: `patient${i}`,
        email: `patient${i}@hospital.com`,
        passwordHash: devPasswordHash,
        roleId: patientRole.id,
        mfaEnabled: false,
        status: "ACTIVE",
      },
    });
    patientUsers.push(patientUser);
  }

  const patients = [];
  for (let i = 0; i < patientUsers.length; i++) {
    const assignedDoctorId = i % 2 === 0 ? doctor1.id : doctor2.id;

    const patient = await prisma.patient.upsert({
      where: { userId: patientUsers[i].id },
      update: {},
      create: {
        userId: patientUsers[i].id,
        medicalRecordNumber: `MRN-100${i + 1}`,
        assignedDoctorId,
      },
    });

    patients.push(patient);
  }

  await prisma.device.upsert({
    where: { deviceFingerprint: "device-doctor1-001" },
    update: {},
    create: {
      userId: doctor1.id,
      deviceFingerprint: "device-doctor1-001",
      isTrusted: true,
      lastIpAddress: "192.168.1.10",
      lastActive: new Date(),
    },
  });

  await prisma.device.upsert({
    where: { deviceFingerprint: "device-doctor2-001" },
    update: {},
    create: {
      userId: doctor2.id,
      deviceFingerprint: "device-doctor2-001",
      isTrusted: true,
      lastIpAddress: "192.168.1.11",
      lastActive: new Date(),
    },
  });

  for (let i = 0; i < patients.length; i++) {
    const assignedDoctorId = i % 2 === 0 ? doctor1.id : doctor2.id;

    const existing = await prisma.eHR.findFirst({
      where: { patientId: patients[i].id },
    });

    if (!existing) {
      await prisma.eHR.create({
        data: {
          patientId: patients[i].id,
          doctorId: assignedDoctorId,
          diagnosis: `Diagnosis for patient ${i + 1}`,
          vitals: {
            bloodPressure: "120/80",
            heartRate: 80 + i,
            temperature: "98.6F",
          },
          s3FileKey: `ehr/patient${i + 1}/report1.pdf`,
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: doctor1.id,
      action: "READ_EHR",
      resourceId: patients[0].id,
      decision: "ALLOW",
      trustScore: 90,
      ipAddress: "192.168.1.10",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: nurse1.id,
      action: "VIEW_PATIENT_VITALS",
      resourceId: patients[1].id,
      decision: "ALLOW",
      trustScore: 84,
      ipAddress: "192.168.1.20",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin1.id,
      action: "MANAGE_USERS",
      resourceId: null,
      decision: "ALLOW",
      trustScore: 95,
      ipAddress: "192.168.1.30",
    },
  });

  console.log("Seed data inserted successfully");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });