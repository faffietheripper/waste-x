import "dotenv/config";
import bcrypt from "bcryptjs";
import { database } from "@/db/database";
import {
  users,
  organisations,
  wasteListings,
  bids,
  carrierAssignments,
  incidents,
  reviews,
  listingTemplates,
  listingTemplateSections,
  listingTemplateFields,
  listingTemplateData,
} from "@/db/schema";
import { ChainOfCustodyType } from "@/util/types";

const uuid = () => crypto.randomUUID();

async function seed() {
  console.log("🌱 Seeding Waste X (CORRECT VERSION)...");

  const passwordHash = await bcrypt.hash("Password123!", 10);

  /* ===============================
     PLATFORM ADMIN
  ============================== */

  await database.insert(users).values({
    id: uuid(),
    name: "Platform Admin",
    email: "admin@wastex.demo",
    passwordHash,
    role: "platform_admin",
  });

  /* ===============================
     ORGANISATIONS (CORRECT TYPES)
  ============================== */

  const orgConfigs: {
    name: string;
    type: ChainOfCustodyType;
  }[] = [
    { name: "BuildCorp Ltd", type: "wasteGenerator" },
    { name: "GreenCycle Waste", type: "wasteManager" },
    { name: "FastHaul Logistics", type: "wasteCarrier" },
  ];

  const orgs: Record<string, any> = {};

  for (const org of orgConfigs) {
    const [created] = await database
      .insert(organisations)
      .values({
        id: uuid(),
        teamName: org.name,
        chainOfCustody: org.type,
        telephone: "0123456789",
        emailAddress: `${org.name.replace(/\s/g, "").toLowerCase()}@demo.com`,
        country: "UK",
        streetAddress: "123 Industrial Way",
        city: "London",
        region: "Greater London",
        postCode: "EC1A 1AA",
      })
      .returning();

    orgs[org.type] = created;
  }

  /* ===============================
     USERS
  ============================== */

  async function createUser(
    name: string,
    email: string,
    organisationId: string,
    role: "administrator" | "employee",
  ) {
    const [user] = await database
      .insert(users)
      .values({
        id: uuid(),
        name,
        email,
        passwordHash,
        organisationId,
        role,
      })
      .returning();

    return user;
  }

  const generatorAdmin = await createUser(
    "BuildCorp Admin",
    "admin@buildcorp.demo",
    orgs["wasteGenerator"].id,
    "administrator",
  );

  const managerUser = await createUser(
    "GreenCycle User",
    "user@greencycle.demo",
    orgs["wasteManager"].id,
    "employee",
  );

  const carrierUser = await createUser(
    "FastHaul Driver",
    "user@fasthaul.demo",
    orgs["wasteCarrier"].id,
    "employee",
  );

  /* ===============================
     TEMPLATE
  ============================== */

  const [template] = await database
    .insert(listingTemplates)
    .values({
      id: uuid(),
      organisationId: orgs["wasteGenerator"].id,
      name: "Standard Waste Template",
      version: 1,
      createdByUserId: generatorAdmin.id,
    })
    .returning();

  const [section] = await database
    .insert(listingTemplateSections)
    .values({
      id: uuid(),
      templateId: template.id,
      title: "Waste Details",
      orderIndex: 1,
    })
    .returning();

  await database.insert(listingTemplateFields).values([
    {
      id: uuid(),
      templateId: template.id,
      sectionId: section.id,
      key: "waste_type",
      label: "Waste Type",
      fieldType: "text",
      orderIndex: 1,
    },
    {
      id: uuid(),
      templateId: template.id,
      sectionId: section.id,
      key: "quantity",
      label: "Quantity",
      fieldType: "number",
      orderIndex: 2,
    },
  ]);

  /* ===============================
     LISTING (GENERATOR)
  ============================== */

  const [listing] = await database
    .insert(wasteListings)
    .values({
      name: "Concrete Waste - Site A",
      location: "London",
      startingPrice: 100,
      currentBid: 120,
      fileKey: "demo.pdf",
      userId: generatorAdmin.id,
      organisationId: orgs["wasteGenerator"].id,
      templateId: template.id,
      templateVersion: 1,
      status: "open",
      endDate: new Date(Date.now() + 5 * 86400000),
    })
    .returning();

  await database.insert(listingTemplateData).values({
    organisationId: orgs["wasteGenerator"].id,
    listingId: listing.id,
    templateId: template.id,
    templateVersion: 1,
    dataJson: JSON.stringify({
      waste_type: "Concrete",
      quantity: 20,
    }),
  });

  /* ===============================
     BID (MANAGER)
  ============================== */

  await database.insert(bids).values({
    amount: 120,
    listingId: listing.id,
    userId: managerUser.id,
    organisationId: orgs["wasteManager"].id,
  });

  /* ===============================
     ASSIGNMENT (TO CARRIER)
  ============================== */

  const [assignment] = await database
    .insert(carrierAssignments)
    .values({
      organisationId: orgs["wasteGenerator"].id,
      listingId: listing.id,
      carrierOrganisationId: orgs["wasteCarrier"].id,
      assignedByOrganisationId: orgs["wasteGenerator"].id,
      status: "accepted",
    })
    .returning();

  /* ===============================
     INCIDENT
  ============================== */

  await database.insert(incidents).values({
    organisationId: orgs["wasteGenerator"].id,
    assignmentId: assignment.id,
    listingId: listing.id,
    reportedByUserId: generatorAdmin.id,
    reportedByOrganisationId: orgs["wasteGenerator"].id,
    type: "damage",
    summary: "Minor spill during transport",
  });

  /* ===============================
     REVIEW
  ============================== */

  await database.insert(reviews).values({
    reviewerId: generatorAdmin.id,
    reviewedOrganisationId: orgs["wasteCarrier"].id,
    listingId: listing.id,
    rating: 4,
    comment: "Good service overall",
  });

  console.log("🎉 SEED COMPLETE — SYSTEM ALIGNED");
}

seed().catch(console.error);
