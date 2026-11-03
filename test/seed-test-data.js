const prisma = require("../src/config/database");
async function main() {
  // 1. Create Platform Employee
  const employee = await prisma.platformEmployee.upsert({
    where: { employeeId: "TEST-EMP-001" },
    update: {},
    create: {
      employeeId: "TEST-EMP-001",
      firstName: "Test",
      lastName: "Admin",
      officialEmail: "test.admin@example.com",
    },
  });

  // 2. Create Clinic
  const clinic = await prisma.clinic.upsert({
    where: { email: "test.clinic@example.com" },
    update: {},
    create: {
      clinicName: "Test Clinic",
      contactPersonName: "Test Doctor",
      medicalRegistrationNumber: "TEST-MED-001",
      clinicLicenseNumber: "TEST-LIC-001",
      mobileNumber: "9999999999",
      email: "test.clinic@example.com",
      address: "Test Street",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560001",
    },
  });

  // 3. Create Vendor
  const vendor = await prisma.vendor.upsert({
    where: { email: "test.vendor@example.com" },
    update: { status: "APPROVED" },
    create: {
      id: "test-vendor-001",
      companyName: "Test Vendor Company",
      ownerName: "Test Owner",
      mobileNumber: "9888888888",
      email: "test.vendor@example.com",
      address: "Test Vendor Street",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560001",
      status: "APPROVED",
    },
  });

  // 4. Create Installation Request
  const request = await prisma.installationRequest.create({
    data: {
      id: "test-installation-001",
      clinicId: clinic.id,
      requestedById: employee.id,
    },
  });

  // 5. Create Installation Assignment
  await prisma.installationAssignment.create({
    data: {
      installationRequestId: request.id,
      clinicId: clinic.id,
      vendorId: vendor.id,
      assignedById: employee.id,
      scheduledDate: new Date(),
      scheduledTime: new Date(),
      supportContactNumber: "9999999999",
      status: "ASSIGNED",
    },
  });

  console.log("Test records created successfully!");
  console.log({
    vendorId: vendor.id,
    installationId: request.id,
    clinicId: clinic.id,
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
