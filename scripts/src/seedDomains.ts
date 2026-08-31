import { db } from "@workspace/db";
import { domainsTable, categoriesTable, criteriaTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { assertEmptyDomainCatalogue } from "./domainSeedGuards";

const MICM_DOMAINS = [
  {
    name: "Strategy",
    description: "How well the business defines, communicates and executes its strategic direction",
    categories: [
      {
        name: "Vision and Direction",
        criteria: [
          { name: "Clear business vision", baseline: "No documented vision exists", excellence: "Vision is well defined, communicated to all staff, and reviewed regularly" },
          { name: "Strategic planning process", baseline: "No formal planning process", excellence: "Structured annual strategy cycle with KPIs and review cadence" },
          { name: "Market awareness", baseline: "Limited understanding of market landscape", excellence: "Regular competitor and market analysis feeding into strategy" },
        ],
      },
      {
        name: "Goals and KPIs",
        criteria: [
          { name: "Business goals defined", baseline: "Goals are informal or unclear", excellence: "SMART goals cascaded across all functions with clear ownership" },
          { name: "Performance measurement", baseline: "No regular performance reviews", excellence: "Regular review of KPIs at all levels with corrective actions" },
        ],
      },
    ],
  },
  {
    name: "Control and Compliance",
    description: "The organisation's ability to manage risk, meet regulatory requirements and maintain financial control",
    categories: [
      {
        name: "Regulatory Compliance",
        criteria: [
          { name: "Legal and regulatory awareness", baseline: "Limited awareness of relevant regulations", excellence: "Comprehensive compliance programme with regular audits" },
          { name: "Quality management system", baseline: "No formal QMS in place", excellence: "Certified QMS (e.g. ISO 9001) actively maintained and improved" },
          { name: "Health and safety management", baseline: "Reactive H&S approach", excellence: "Proactive H&S culture with regular risk assessments and training" },
        ],
      },
      {
        name: "Financial Controls",
        criteria: [
          { name: "Financial reporting accuracy", baseline: "Ad-hoc or delayed financial reporting", excellence: "Real-time financial dashboards with timely and accurate reports" },
          { name: "Budget management", baseline: "No formal budgeting process", excellence: "Detailed budgets with variance analysis and forecasting" },
        ],
      },
    ],
  },
  {
    name: "Leadership and Culture",
    description: "The quality of leadership, management capability and the workplace culture they create",
    categories: [
      {
        name: "Leadership Capability",
        criteria: [
          { name: "Leadership visibility and engagement", baseline: "Leaders are rarely visible on the shop floor", excellence: "Leaders actively engage with teams, listen and act on feedback" },
          { name: "Management development", baseline: "No investment in management development", excellence: "Structured development programmes for all managers" },
          { name: "Decision making clarity", baseline: "Decision making is unclear or inconsistent", excellence: "Clear decision rights at all levels with empowerment culture" },
        ],
      },
      {
        name: "Culture and Engagement",
        criteria: [
          { name: "Employee engagement", baseline: "Low engagement, high turnover", excellence: "High engagement evidenced by surveys, retention and discretionary effort" },
          { name: "Continuous improvement culture", baseline: "Improvement ideas rarely sought or implemented", excellence: "Everyone actively contributes improvement ideas regularly" },
          { name: "Diversity and inclusion", baseline: "No active approach to D&I", excellence: "Inclusive culture evidenced by metrics and lived experience" },
        ],
      },
    ],
  },
  {
    name: "Daily Management",
    description: "How effectively the business manages day-to-day operations and performance",
    categories: [
      {
        name: "Visual Management",
        criteria: [
          { name: "Performance boards and metrics", baseline: "No visible performance data in production areas", excellence: "Real-time visual boards at all key points, understood by all" },
          { name: "Standard operating procedures", baseline: "SOPs missing or not followed", excellence: "All key processes documented, accessible and regularly reviewed" },
        ],
      },
      {
        name: "Operational Meetings",
        criteria: [
          { name: "Daily huddles / tier meetings", baseline: "No structured daily meetings", excellence: "Effective daily tiered meetings covering safety, quality, delivery and cost" },
          { name: "Escalation processes", baseline: "Issues are escalated inconsistently", excellence: "Clear escalation paths with defined response times and owners" },
          { name: "Problem solving approach", baseline: "Problems recur without root cause analysis", excellence: "Structured problem solving (e.g. A3, 8D) embedded across teams" },
        ],
      },
    ],
  },
  {
    name: "Processes and Tools",
    description: "The maturity and effectiveness of operational processes, technology and tooling",
    categories: [
      {
        name: "Process Design",
        criteria: [
          { name: "Process mapping and documentation", baseline: "Processes are undocumented or siloed", excellence: "End-to-end value stream maps maintained and used to drive improvement" },
          { name: "Waste elimination (Lean)", baseline: "No awareness or use of Lean tools", excellence: "Lean tools embedded; waste regularly identified and removed" },
          { name: "Process standardisation", baseline: "Significant variation in how work is performed", excellence: "Standardised processes that minimise variation and errors" },
        ],
      },
      {
        name: "Technology and Systems",
        criteria: [
          { name: "ERP and digital systems", baseline: "No ERP or significant manual workarounds", excellence: "Integrated digital systems providing real-time operational data" },
          { name: "Data and analytics capability", baseline: "Decisions based on opinion rather than data", excellence: "Data-driven decision making supported by analytics tools" },
          { name: "Automation and Industry 4.0", baseline: "No automation or digital manufacturing", excellence: "Targeted automation and smart manufacturing delivering measurable benefit" },
        ],
      },
    ],
  },
  {
    name: "Innovation",
    description: "The organisation's capacity and commitment to developing new products, services and ways of working",
    categories: [
      {
        name: "Product and Service Development",
        criteria: [
          { name: "New product development process", baseline: "No formal NPD process", excellence: "Structured NPD gate process with cross-functional teams" },
          { name: "Customer insight and co-creation", baseline: "Customer voice rarely feeds into development", excellence: "Customers actively involved in product and service design" },
          { name: "IP and knowledge management", baseline: "No IP strategy or knowledge capture", excellence: "Active IP strategy and systematic knowledge management" },
        ],
      },
      {
        name: "Innovation Culture and Investment",
        criteria: [
          { name: "R&D investment", baseline: "No dedicated R&D budget or activity", excellence: "Consistent R&D investment aligned to strategic growth priorities" },
          { name: "Innovation pipeline management", baseline: "Ideas rarely progressed beyond initial stage", excellence: "Managed pipeline of innovation projects with clear stage gates" },
          { name: "Collaboration and partnerships", baseline: "No external collaboration for innovation", excellence: "Active partnerships with universities, peers and supply chain for innovation" },
        ],
      },
    ],
  },
];

async function seed() {
  console.log("Seeding MICM domains, categories and criteria...");

  await db.transaction(async tx => {
  await tx.execute(sql`LOCK TABLE domains, categories, criteria IN SHARE ROW EXCLUSIVE MODE`);
  assertEmptyDomainCatalogue([
    (await tx.select().from(domainsTable).limit(1)).length,
    (await tx.select().from(categoriesTable).limit(1)).length,
    (await tx.select().from(criteriaTable).limit(1)).length,
  ]);
  for (const [domainIdx, domainData] of MICM_DOMAINS.entries()) {
    const [domain] = await tx.insert(domainsTable).values({
      name: domainData.name,
      description: domainData.description,
      orderIndex: domainIdx,
    }).returning();

    console.log(`  Domain: ${domain.name}`);

    for (const [catIdx, catData] of domainData.categories.entries()) {
      const [category] = await tx.insert(categoriesTable).values({
        domainId: domain.id,
        name: catData.name,
        orderIndex: catIdx,
      }).returning();

      for (const [critIdx, critData] of catData.criteria.entries()) {
        await tx.insert(criteriaTable).values({
          categoryId: category.id,
          name: critData.name,
          baselineDescription: critData.baseline,
          excellenceDescription: critData.excellence,
          orderIndex: critIdx,
        });
      }
    }
  }

  });
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
