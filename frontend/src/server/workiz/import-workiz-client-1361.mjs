#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const AUTHORIZED_WORKIZ_CLIENT_ID = "1361";
const AUTHORIZED_WORKIZ_CLIENT_NAME = "Steven Wolf";
const HOMEFIX_COMPANY_ID = "f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633";
const DOWNLOADS_DIR = "/Users/serhiitatarenko/Downloads";
const EXPECTED_JOB_IDS = ["303", "327", "399", "411", "509", "716", "733", "815", "819"];
const EXPECTED_COUNTS = {
  jobs: 9,
  estimates: 10,
  invoices: 8,
  payments: 9,
  financialSnapshots: 9,
  addresses: 1,
};

const SOURCE_FILES = {
  customers: ["export_export-8.csv"],
  jobs: ["export_export-9.csv", "export_export-10.csv", "export_export-11.csv", "export_export.csv"],
  estimates: ["export_export-12.csv"],
  invoices: ["export_export-5.csv", "export_export-22.csv"],
  payments: [
    "Payment report - 09-29-2026.csv",
    "Payment report - 09-29-2026-2.csv",
    "Payment report - 09-29-2026-3.csv",
  ],
  financialSnapshots: ["export_export-16.csv", "export_export-17.csv", "export_export-18.csv"],
};

const STATUS_MAP = new Map([
  ["done", "completed"],
  ["submitted", "completed"],
  ["done pending approval", "completed"],
  ["canceled", "canceled"],
]);

const ESTIMATE_STATUS_MAP = new Map([
  ["won", "approved"],
  ["denied", "declined"],
  ["lost", "declined"],
  ["sent", "sent"],
]);

const INVOICE_STATUS_MAP = new Map([
  ["paid", "paid"],
  ["draft", "draft"],
  ["sent", "sent"],
  ["void", "void"],
  ["voided", "void"],
]);

function parseArgs(argv) {
  const args = {
    clientId: AUTHORIZED_WORKIZ_CLIENT_ID,
    write: false,
    confirmClient: null,
    csvDir: DOWNLOADS_DIR,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--write") {
      args.write = true;
    } else if (arg.startsWith("--client=")) {
      args.clientId = arg.slice("--client=".length);
    } else if (arg.startsWith("--confirm-client=")) {
      args.confirmClient = arg.slice("--confirm-client=".length);
    } else if (arg.startsWith("--csv-dir=")) {
      args.csvDir = arg.slice("--csv-dir=".length);
    } else if (arg === "--dry-run") {
      args.write = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.clientId !== AUTHORIZED_WORKIZ_CLIENT_ID) {
    throw new Error(`Pilot importer is hard-guarded to Workiz Client #${AUTHORIZED_WORKIZ_CLIENT_ID}.`);
  }

  if (args.write && args.confirmClient !== AUTHORIZED_WORKIZ_CLIENT_ID) {
    throw new Error("WRITE mode requires --write --confirm-client=1361.");
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;
  return dataRows
    .filter((dataRow) => dataRow.some((cell) => cell.trim()))
    .map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ""])));
}

function readCsvFile(csvDir, fileName) {
  const path = resolve(csvDir, fileName);
  return parseCsv(readFileSync(path, "utf8")).map((row) => ({ ...row, _source_file: basename(path) }));
}

function readCsvGroup(csvDir, names) {
  return names.flatMap((name) => readCsvFile(csvDir, name));
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function phone10(value) {
  return normalizePhone(value).slice(-10);
}

function normalizeMoney(value) {
  const cleaned = String(value ?? "").replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value) {
  const text = String(value ?? "").trim();
  return text ? normalizeMoney(text) : null;
}

function parseWorkizDate(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text.replace(/\b(am|pm)\b/i, (part) => part.toUpperCase()));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function datePart(iso) {
  return iso ? iso.slice(0, 10) : null;
}

function timePart(iso) {
  return iso ? iso.slice(11, 16) : null;
}

function makeImportKey(kind, id) {
  return `workiz:${kind}:${id}`;
}

function splitName(name) {
  const parts = normalizeText(name).split(" ").filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function parseAddress(value) {
  const text = normalizeText(value);
  const endMatch = text.match(/^(.*?)\s*,?\s+(Texas|TX)\s*,?\s+(\d{5})(?:\s*,?\s+(US))?$/i);
  if (!endMatch) {
    return {
      fullAddress: text || null,
      streetAddress: text || null,
      city: null,
      state: "TX",
      zipCode: "",
      country: "US",
    };
  }

  const prefix = normalizeText(endMatch[1]).replace(/,+$/g, "");
  const commaParts = prefix.split(",").map(normalizeText).filter(Boolean);
  const city = commaParts.length > 1
    ? commaParts[commaParts.length - 1]
    : prefix.split(" ").filter(Boolean).at(-1) ?? null;
  const street = commaParts.length > 1
    ? commaParts.slice(0, -1).join(", ")
    : prefix.split(" ").filter(Boolean).slice(0, -1).join(" ");

  return {
    fullAddress: text,
    streetAddress: street || prefix,
    city: city ? normalizeText(city) : null,
    state: normalizeState(endMatch[2]),
    zipCode: normalizeText(endMatch[3]),
    country: normalizeText(endMatch[4] ?? "US").toUpperCase(),
  };
}

function jobAddress(job) {
  const parts = [job.Address, job.City, job.State, job["Zip code"]].map(normalizeText).filter(Boolean);
  return parseAddress(parts.join(", ").replace(/,\s*([A-Z]{2}),\s*(\d{5})$/, ", $1 $2"));
}

function normalizeState(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "texas") {
    return "TX";
  }
  return normalizeText(value).toUpperCase().slice(0, 2) || "TX";
}

function addressIdentity(address) {
  return [
    normalizeKey(address.streetAddress),
    normalizeKey(address.city),
    normalizeState(address.state),
    normalizeText(address.zipCode),
  ].join("|");
}

function dedupeBy(rows, getKey) {
  const result = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) {
      continue;
    }
    const existing = result.get(key);
    const score = Object.values(row).filter(Boolean).length;
    if (!existing || score > existing.score) {
      result.set(key, { score, row });
    }
  }
  return [...result.values()].map(({ row }) => row);
}

function mapServiceRequestStatus(status) {
  return STATUS_MAP.get(normalizeKey(status)) ?? "completed";
}

function mapEstimateStatus(status) {
  return ESTIMATE_STATUS_MAP.get(normalizeKey(status)) ?? "draft";
}

function mapInvoiceStatus(status) {
  const normalized = normalizeKey(status).split(" - ")[0];
  return INVOICE_STATUS_MAP.get(normalized) ?? "sent";
}

function mapPaymentStatus(status) {
  const normalized = normalizeKey(status);
  if (normalized.includes("refund")) {
    return "refunded";
  }
  if (normalized.includes("void")) {
    return "void";
  }
  if (normalized.includes("paid")) {
    return "paid";
  }
  return "imported";
}

function paymentIdentity(payment, index) {
  return [
    payment["Job ID"],
    payment.Document,
    payment["Payment date"],
    payment["Payment time"],
    payment.Amount,
    payment.Card,
    index,
  ]
    .map((part) => normalizeText(part).replace(/:/g, "-"))
    .join(":");
}

function cardLast4(value) {
  const digits = normalizePhone(value);
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function buildDataset(csvDir) {
  const customerRows = readCsvGroup(csvDir, SOURCE_FILES.customers);
  const customer = customerRows.find((row) => normalizeText(row["Client #"]) === AUTHORIZED_WORKIZ_CLIENT_ID);
  if (!customer) {
    throw new Error(`Client #${AUTHORIZED_WORKIZ_CLIENT_ID} not found in customer export.`);
  }
  if (normalizeText(customer.Name) !== AUTHORIZED_WORKIZ_CLIENT_NAME) {
    throw new Error(`Client #${AUTHORIZED_WORKIZ_CLIENT_ID} is not ${AUTHORIZED_WORKIZ_CLIENT_NAME}.`);
  }

  const jobRows = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.jobs), (row) => normalizeText(row["Job #"]));
  const expectedJobSet = new Set(EXPECTED_JOB_IDS);
  const jobs = jobRows
    .filter((row) => expectedJobSet.has(normalizeText(row["Job #"])))
    .sort((left, right) => Number(left["Job #"]) - Number(right["Job #"]));

  const customerPhone = phone10(customer.Phone);
  const customerEmail = normalizeKey(customer.Email);
  const customerName = normalizeKey(customer.Name);
  for (const job of jobs) {
    const score =
      (normalizeKey(job.Client) === customerName ? 1 : 0) +
      (customerPhone && phone10(job.Phone) === customerPhone ? 1 : 0) +
      (customerEmail && normalizeKey(job.Email) === customerEmail ? 1 : 0);
    if (score < 2 && normalizeText(job["Job #"]) !== "509") {
      throw new Error(`Job ${job["Job #"]} does not strongly match Client #1361.`);
    }
  }

  const jobIds = new Set(jobs.map((job) => normalizeText(job["Job #"])));
  const estimates = readCsvGroup(csvDir, SOURCE_FILES.estimates)
    .filter((row) => jobIds.has(normalizeText(row.Job)))
    .sort((left, right) => normalizeText(left["Estimate #"]).localeCompare(normalizeText(right["Estimate #"])));

  const invoices = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.invoices), (row) => normalizeText(row["Invoice NO."]))
    .filter((row) => jobIds.has(normalizeText(row.Job)))
    .sort((left, right) => Number(left.Job) - Number(right.Job));

  const payments = readCsvGroup(csvDir, SOURCE_FILES.payments)
    .filter((row) => jobIds.has(normalizeText(row["Job ID"])))
    .map((row, index) => ({ ...row, _payment_identity: paymentIdentity(row, index) }))
    .sort((left, right) => Number(left["Job ID"]) - Number(right["Job ID"]));

  const financialSnapshots = dedupeBy(
    readCsvGroup(csvDir, SOURCE_FILES.financialSnapshots),
    (row) => normalizeText(row["Job #"]),
  )
    .filter((row) => jobIds.has(normalizeText(row["Job #"])))
    .sort((left, right) => Number(left["Job #"]) - Number(right["Job #"]));

  const uniqueAddresses = new Map();
  const customerAddress = parseAddress(customer.Address);
  uniqueAddresses.set(addressIdentity(customerAddress), customerAddress);
  for (const job of jobs) {
    const parsed = jobAddress(job);
    if (parsed.fullAddress) {
      uniqueAddresses.set(addressIdentity(parsed), parsed);
    }
  }

  return {
    customer,
    address: [...uniqueAddresses.values()][0],
    uniqueAddressCount: uniqueAddresses.size,
    jobs,
    estimates,
    invoices,
    payments,
    financialSnapshots,
  };
}

function validateDataset(dataset) {
  const errors = [];
  const jobIds = dataset.jobs.map((job) => normalizeText(job["Job #"]));
  const missingJobs = EXPECTED_JOB_IDS.filter((jobId) => !jobIds.includes(jobId));
  const unexpectedJobs = jobIds.filter((jobId) => !EXPECTED_JOB_IDS.includes(jobId));

  if (missingJobs.length > 0) errors.push(`Missing expected jobs: ${missingJobs.join(", ")}`);
  if (unexpectedJobs.length > 0) errors.push(`Unexpected jobs: ${unexpectedJobs.join(", ")}`);
  if (dataset.jobs.length !== EXPECTED_COUNTS.jobs) errors.push(`Expected 9 jobs, resolved ${dataset.jobs.length}`);
  if (dataset.estimates.length !== EXPECTED_COUNTS.estimates) errors.push(`Expected 10 estimates, resolved ${dataset.estimates.length}`);
  if (dataset.invoices.length !== EXPECTED_COUNTS.invoices) errors.push(`Expected 8 invoices, resolved ${dataset.invoices.length}`);
  if (dataset.payments.length !== EXPECTED_COUNTS.payments) errors.push(`Expected 9 payments, resolved ${dataset.payments.length}`);
  if (dataset.financialSnapshots.length !== EXPECTED_COUNTS.financialSnapshots) {
    errors.push(`Expected 9 financial snapshots, resolved ${dataset.financialSnapshots.length}`);
  }
  if (dataset.uniqueAddressCount !== EXPECTED_COUNTS.addresses) {
    errors.push(`Expected 1 address, resolved ${dataset.uniqueAddressCount}`);
  }

  return errors;
}

function createSupabaseClient() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));
  loadEnvFile(resolve(process.cwd(), "frontend/.env.local"));
  loadEnvFile(resolve(process.cwd(), "frontend/.env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchExistingState(supabase, dataset) {
  if (!supabase) {
    return {
      customerMatches: [],
      addressMatches: [],
      serviceRequests: [],
      estimates: [],
      invoices: [],
      payments: [],
      financialSnapshots: [],
      appointments: [],
      technicianMatch: null,
      technicianAmbiguous: false,
      dbAvailable: false,
    };
  }

  const phone = normalizePhone(dataset.customer.Phone);
  const email = normalizeKey(dataset.customer.Email);
  const address = dataset.address;

  const candidateQueries = [
    supabase.from("customers").select("*").eq("company_id", HOMEFIX_COMPANY_ID).eq("source_system", "workiz").eq("external_customer_id", AUTHORIZED_WORKIZ_CLIENT_ID),
    phone ? supabase.from("customers").select("*").eq("company_id", HOMEFIX_COMPANY_ID).eq("phone", phone) : null,
    email ? supabase.from("customers").select("*").eq("company_id", HOMEFIX_COMPANY_ID).ilike("email", email) : null,
  ].filter(Boolean);

  const customerCandidates = new Map();
  for (const query of candidateQueries) {
    const { data, error } = await query;
    if (error) {
      throw new Error(`Customer match query failed: ${error.message}`);
    }
    for (const candidate of data ?? []) {
      customerCandidates.set(candidate.id, candidate);
    }
  }

  const customerMatches = [...customerCandidates.values()];
  const customerIds = customerMatches.map((customer) => customer.id);

  let addressMatches = [];
  if (customerIds.length > 0) {
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .in("customer_id", customerIds)
      .eq("company_id", HOMEFIX_COMPANY_ID);
    if (error) throw new Error(`Address match query failed: ${error.message}`);
    addressMatches = (data ?? []).filter((row) => {
      return (
        normalizeKey(row.street_address) === normalizeKey(address.streetAddress) &&
        normalizeKey(row.city) === normalizeKey(address.city) &&
        normalizeKey(row.state) === normalizeKey(address.state) &&
        normalizeText(row.zip_code) === normalizeText(address.zipCode)
      );
    });
  }

  const jobIds = dataset.jobs.map((job) => normalizeText(job["Job #"]));
  const { data: serviceRequests, error: srError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("company_id", HOMEFIX_COMPANY_ID)
    .eq("source_system", "workiz")
    .in("external_job_id", jobIds);
  if (srError) {
    throw new Error(`Existing Workiz job query failed: ${srError.message}`);
  }

  let estimates = [];
  let invoices = [];
  let payments = [];
  let snapshots = [];

  if ((serviceRequests ?? []).length > 0) {
    const estimateKeys = dataset.estimates.map((estimate) => makeImportKey("estimate", estimate["Estimate #"]));
    const invoiceKeys = dataset.invoices.map((invoice) => makeImportKey("invoice", invoice["Invoice NO."]));
    const paymentKeys = dataset.payments.map((payment) => makeImportKey("payment", payment._payment_identity));

    const [
      { data: estimateRows, error: estimateError },
      { data: invoiceRows, error: invoiceError },
      { data: paymentRows, error: paymentError },
      { data: snapshotRows, error: snapshotError },
    ] = await Promise.all([
      estimateKeys.length
        ? supabase.from("service_request_estimates").select("*").in("external_import_key", estimateKeys)
        : Promise.resolve({ data: [], error: null }),
      invoiceKeys.length
        ? supabase.from("service_request_invoices").select("*").in("external_import_key", invoiceKeys)
        : Promise.resolve({ data: [], error: null }),
      paymentKeys.length
        ? supabase.from("service_request_payments").select("*").in("external_import_key", paymentKeys)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("service_request_financial_snapshots")
        .select("*")
        .eq("company_id", HOMEFIX_COMPANY_ID)
        .eq("source_system", "workiz")
        .in("external_job_id", jobIds),
    ]);

    for (const error of [estimateError, invoiceError, paymentError, snapshotError]) {
      if (error) {
        throw new Error(`Existing child import query failed: ${error.message}`);
      }
    }
    estimates = estimateRows ?? [];
    invoices = invoiceRows ?? [];
    payments = paymentRows ?? [];
    snapshots = snapshotRows ?? [];
  }

  const { data: technicians, error: technicianError } = await supabase
    .from("technician_profiles")
    .select("*")
    .eq("company_id", HOMEFIX_COMPANY_ID)
    .or("display_name.eq.Serhii Tatarenko,business_name.eq.Serhii Tatarenko");
  if (technicianError) {
    throw new Error(`Technician match query failed: ${technicianError.message}`);
  }

  let appointments = [];
  if ((serviceRequests ?? []).length > 0) {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .in("service_request_id", serviceRequests.map((request) => request.id));
    if (error) throw new Error(`Appointment query failed: ${error.message}`);
    appointments = data ?? [];
  }

  return {
    customerMatches,
    addressMatches,
    serviceRequests: serviceRequests ?? [],
    estimates,
    invoices,
    payments,
    financialSnapshots: snapshots,
    appointments,
    technicianMatch: (technicians ?? []).length === 1 ? technicians[0] : null,
    technicianAmbiguous: (technicians ?? []).length > 1,
    dbAvailable: true,
  };
}

function decideCustomerMatch(existing) {
  if (!existing.dbAvailable) {
    return { state: "UNKNOWN", action: "STOP", reason: "Database client not configured for matching." };
  }
  if (existing.customerMatches.length === 0) {
    return { state: "NO", action: "CREATE", customer: null };
  }
  if (existing.customerMatches.length === 1) {
    return { state: "YES", action: "MATCH", customer: existing.customerMatches[0] };
  }
  return { state: "AMBIGUOUS", action: "STOP", reason: "Multiple HomeFix customer candidates matched." };
}

function financialSummary(dataset) {
  const invoiced = dataset.invoices.reduce((sum, invoice) => sum + normalizeMoney(invoice["Total Amount"]), 0);
  const invoiceDue = dataset.invoices.reduce((sum, invoice) => sum + normalizeMoney(invoice["Amount Due"]), 0);
  const paid = dataset.payments.reduce((sum, payment) => sum + normalizeMoney(payment.Amount), 0);
  const snapshotDue = dataset.financialSnapshots.reduce((sum, snapshot) => sum + normalizeMoney(snapshot["Due amount"]), 0);
  const tips = dataset.payments.reduce((sum, payment) => sum + normalizeMoney(payment.Tips), 0);
  const refunds = dataset.payments
    .filter((payment) => `${payment["Payment type"]} ${payment.Status}`.toLowerCase().includes("refund"))
    .reduce((sum, payment) => sum + normalizeMoney(payment.Amount), 0);
  const methods = [...new Set(dataset.payments.map((payment) => normalizeText(payment["Payment type"] || "Unknown")))].sort();
  return { invoiced, invoiceDue, paid, snapshotDue, tips, refunds, methods };
}

function countAlreadyImported(existing) {
  return {
    jobs: existing.serviceRequests.length,
    estimates: existing.estimates.length,
    invoices: existing.invoices.length,
    payments: existing.payments.length,
    financialSnapshots: existing.financialSnapshots.length,
  };
}

function buildReport(dataset, existing, validationErrors, customerDecision) {
  const imported = countAlreadyImported(existing);
  const unassignedJobs = dataset.jobs
    .filter((job) => normalizeKey(job.Tech) === "none" || !normalizeText(job.Tech))
    .map((job) => normalizeText(job["Job #"]));
  const unresolved = [];

  if (existing.technicianAmbiguous) {
    unresolved.push("technician:Serhii Tatarenko");
  }
  if (customerDecision.action === "STOP") {
    unresolved.push(`customer:${AUTHORIZED_WORKIZ_CLIENT_ID}`);
  }
  for (const error of validationErrors) {
    unresolved.push(`validation:${error}`);
  }

  const summary = financialSummary(dataset);
  const lines = [];
  lines.push("WORKIZ PILOT IMPORT DRY RUN");
  lines.push(`Client: #${AUTHORIZED_WORKIZ_CLIENT_ID} ${AUTHORIZED_WORKIZ_CLIENT_NAME}`);
  lines.push("");
  lines.push("CUSTOMER");
  lines.push(`Existing match: ${customerDecision.state}`);
  lines.push(`Action: ${customerDecision.action}`);
  lines.push("");
  lines.push("ADDRESSES");
  lines.push(`matched: ${existing.addressMatches.length}`);
  lines.push(`created: ${customerDecision.action === "CREATE" || existing.addressMatches.length === 0 ? 1 : 0}`);
  lines.push("");
  lines.push("JOBS");
  lines.push(`expected: ${EXPECTED_COUNTS.jobs}`);
  lines.push(`resolved: ${dataset.jobs.length}`);
  lines.push(`would create: ${Math.max(0, dataset.jobs.length - imported.jobs)}`);
  lines.push(`already imported: ${imported.jobs}`);
  lines.push("");
  lines.push("APPOINTMENTS");
  lines.push(`would create: ${dataset.jobs.filter((job) => parseWorkizDate(job.Scheduled) && parseWorkizDate(job.End) && normalizeKey(job.Tech) !== "none" && normalizeText(job.Tech)).length}`);
  lines.push(`skipped due insufficient data: ${dataset.jobs.filter((job) => !parseWorkizDate(job.Scheduled) || !parseWorkizDate(job.End) || normalizeKey(job.Tech) === "none" || !normalizeText(job.Tech)).map((job) => job["Job #"]).join(", ") || "none"}`);
  lines.push("");
  lines.push("ESTIMATES");
  lines.push(`expected: ${EXPECTED_COUNTS.estimates}`);
  lines.push(`resolved: ${dataset.estimates.length}`);
  lines.push(`would create: ${Math.max(0, dataset.estimates.length - imported.estimates)}`);
  lines.push(`already imported: ${imported.estimates}`);
  lines.push("");
  lines.push("INVOICES");
  lines.push(`expected: ${EXPECTED_COUNTS.invoices}`);
  lines.push(`resolved: ${dataset.invoices.length}`);
  lines.push(`would create: ${Math.max(0, dataset.invoices.length - imported.invoices)}`);
  lines.push(`already imported: ${imported.invoices}`);
  lines.push("");
  lines.push("PAYMENTS");
  lines.push(`expected: ${EXPECTED_COUNTS.payments}`);
  lines.push(`resolved: ${dataset.payments.length}`);
  lines.push(`would create: ${Math.max(0, dataset.payments.length - imported.payments)}`);
  lines.push(`already imported: ${imported.payments}`);
  lines.push("");
  lines.push("FINANCIAL SNAPSHOTS");
  lines.push(`expected: ${EXPECTED_COUNTS.financialSnapshots}`);
  lines.push(`resolved: ${dataset.financialSnapshots.length}`);
  lines.push(`would create: ${Math.max(0, dataset.financialSnapshots.length - imported.financialSnapshots)}`);
  lines.push(`already imported: ${imported.financialSnapshots}`);
  lines.push("");
  lines.push("TECHNICIAN");
  lines.push(`matched: ${existing.technicianMatch ? "Serhii Tatarenko" : "NO"}`);
  lines.push(`unassigned jobs: ${unassignedJobs.join(", ") || "none"}`);
  lines.push("");
  lines.push("STATUS MAPPING");
  lines.push("Done -> completed");
  lines.push("Submitted -> completed");
  lines.push("done pending approval -> completed");
  lines.push("");
  lines.push("ASSET HANDLING");
  lines.push("No customer_appliances will be created from generic Workiz Job Type text.");
  lines.push("");
  lines.push("FINANCIAL SUMMARY");
  lines.push(`historical invoiced total: ${formatMoney(summary.invoiced)}`);
  lines.push(`historical paid amount: ${formatMoney(summary.paid)}`);
  lines.push(`snapshot outstanding amount: ${formatMoney(summary.snapshotDue)}`);
  lines.push(`invoice amount-due total: ${formatMoney(summary.invoiceDue)}`);
  lines.push(`tips: ${formatMoney(summary.tips)}`);
  lines.push(`refunds: ${formatMoney(summary.refunds)}`);
  lines.push(`payment methods represented: ${summary.methods.join(", ")}`);
  lines.push("");
  lines.push("UNRESOLVED / AMBIGUOUS RECORDS");
  lines.push(unresolved.length ? unresolved.join("\n") : "none");
  lines.push("");
  lines.push(`PILOT DRY RUN: ${unresolved.length === 0 ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function customerPayload(dataset) {
  const { firstName, lastName } = splitName(dataset.customer.Name);
  return {
    company_id: HOMEFIX_COMPANY_ID,
    first_name: firstName,
    last_name: lastName,
    full_name: normalizeText(dataset.customer.Name),
    phone: normalizePhone(dataset.customer.Phone) || null,
    email: normalizeKey(dataset.customer.Email) || null,
    preferred_contact_method: "phone",
    customer_status: "active",
    source_system: "workiz",
    external_customer_id: AUTHORIZED_WORKIZ_CLIENT_ID,
    imported_at: new Date().toISOString(),
    import_metadata: {
      workiz_client_number: AUTHORIZED_WORKIZ_CLIENT_ID,
      workiz_created: dataset.customer.Created,
      workiz_ad_source: dataset.customer["Ad Source"] || null,
      workiz_service_plan: dataset.customer["Service Plan"] || null,
      source_file: dataset.customer._source_file,
    },
    created_at: parseWorkizDate(dataset.customer.Created) ?? new Date().toISOString(),
  };
}

function addressPayload(dataset, customerId) {
  return {
    company_id: HOMEFIX_COMPANY_ID,
    customer_id: customerId,
    label: "Workiz historical address",
    street_address: dataset.address.streetAddress,
    city: dataset.address.city,
    state: dataset.address.state || "TX",
    zip_code: dataset.address.zipCode,
    country: dataset.address.country || "US",
    is_primary: true,
    source_system: "workiz",
    external_address_key: makeImportKey("customer-address", AUTHORIZED_WORKIZ_CLIENT_ID),
    imported_at: new Date().toISOString(),
    import_metadata: { workiz_raw_address: dataset.customer.Address },
  };
}

function serviceRequestPayload(job, customerId, addressId, technicianProfile) {
  const address = jobAddress(job);
  const scheduled = parseWorkizDate(job.Scheduled);
  const end = parseWorkizDate(job.End);
  const status = mapServiceRequestStatus(job.Status);
  return {
    company_id: HOMEFIX_COMPANY_ID,
    customer_id: customerId,
    customer_address_id: addressId,
    customer_name: normalizeText(job.Client) || AUTHORIZED_WORKIZ_CLIENT_NAME,
    customer_email: normalizeKey(job.Email) || null,
    customer_phone: normalizePhone(job.Phone) || null,
    appliance_type: normalizeText(job.Type) || "Appliance",
    appliance_brand: null,
    appliance_model: null,
    issue_description: normalizeText(job["Job name"]) || normalizeText(job.Type) || "Historical Workiz job",
    full_address: address.fullAddress,
    street_address: address.streetAddress,
    city: address.city,
    state: address.state || "TX",
    zip_code: address.zipCode || "00000",
    country: address.country || "US",
    preferred_time_window: null,
    selected_technician_business_name: normalizeKey(job.Tech) === "none" ? null : normalizeText(job.Tech) || null,
    assigned_technician_profile_id: normalizeKey(job.Tech) === "serhii tatarenko" ? technicianProfile?.profile_id ?? null : null,
    scheduled_date: datePart(scheduled),
    scheduled_window_start_time: timePart(scheduled),
    scheduled_window_end_time: timePart(end),
    request_source: "other",
    status,
    attribution: {
      source: normalizeText(job.Source) || null,
      tags: normalizeText(job.Tags) || null,
      source_file: job._source_file,
    },
    source_system: "workiz",
    external_job_id: normalizeText(job["Job #"]),
    imported_at: new Date().toISOString(),
    import_metadata: {
      workiz_job_number: normalizeText(job["Job #"]),
      workiz_status: normalizeText(job.Status),
      workiz_type: normalizeText(job.Type),
      workiz_created: normalizeText(job.Created),
      workiz_scheduled: normalizeText(job.Scheduled),
      workiz_end: normalizeText(job.End),
      workiz_total: normalizeMoney(job.Total),
      workiz_source: normalizeText(job.Source) || null,
      mapped_status: status,
      mapped_request_source: "other",
    },
    created_at: parseWorkizDate(job.Created) ?? new Date().toISOString(),
  };
}

function estimatePayload(estimate, requestId) {
  const amount = normalizeMoney(estimate.Amount);
  return {
    service_request_id: requestId,
    subtotal: amount,
    total: amount,
    estimate_status: mapEstimateStatus(estimate.Status),
    estimate_number: normalizeText(estimate["Estimate #"]),
    source_system: "workiz",
    external_estimate_id: normalizeText(estimate["Estimate #"]),
    external_import_key: makeImportKey("estimate", estimate["Estimate #"]),
    imported_at: new Date().toISOString(),
    import_metadata: {
      workiz_status: normalizeText(estimate.Status),
      workiz_job_number: normalizeText(estimate.Job),
      source_file: estimate._source_file,
    },
    created_at: parseWorkizDate(estimate.Created) ?? new Date().toISOString(),
  };
}

function invoicePayload(invoice, requestId) {
  return {
    service_request_id: requestId,
    estimate_id: null,
    invoice_number: normalizeText(invoice["Invoice NO."]),
    subtotal: normalizeMoney(invoice.Subtotal),
    discount_amount: nullableNumber(invoice.Discount),
    tax: nullableNumber(invoice.Tax),
    total: normalizeMoney(invoice["Total Amount"]),
    amount_due: nullableNumber(invoice["Amount Due"]),
    invoice_status: mapInvoiceStatus(invoice.Status),
    sent_at: parseWorkizDate(invoice.Created),
    paid_at: normalizeKey(invoice.Status).startsWith("paid") ? parseWorkizDate(invoice.Created) : null,
    source_system: "workiz",
    external_invoice_id: normalizeText(invoice["Invoice NO."]),
    external_import_key: makeImportKey("invoice", invoice["Invoice NO."]),
    imported_at: new Date().toISOString(),
    import_metadata: {
      workiz_status: normalizeText(invoice.Status),
      workiz_job_number: normalizeText(invoice.Job),
      workiz_invoice_name: normalizeText(invoice["Invoice Name"]),
      source_file: invoice._source_file,
    },
    created_at: parseWorkizDate(invoice.Created) ?? new Date().toISOString(),
  };
}

function paymentPayload(payment, requestId, invoiceId) {
  const paymentDateTime = parseWorkizDate(`${payment["Payment date"]} ${payment["Payment time"]}`);
  return {
    company_id: HOMEFIX_COMPANY_ID,
    service_request_id: requestId,
    invoice_id: invoiceId,
    source_system: "workiz",
    external_payment_id: normalizeText(payment._payment_identity),
    external_import_key: makeImportKey("payment", payment._payment_identity),
    payment_status: mapPaymentStatus(payment.Status),
    payment_type: normalizeText(payment["Payment type"]) || null,
    payment_method: normalizeText(payment["Transaction method"]) || null,
    amount: normalizeMoney(payment.Amount),
    service_fee: nullableNumber(payment["Service Fee"]),
    net_amount: nullableNumber(payment.Net),
    tip_amount: nullableNumber(payment.Tips),
    payment_date: payment["Payment date"] ? parseWorkizDate(payment["Payment date"])?.slice(0, 10) ?? null : null,
    paid_at: paymentDateTime,
    confirmation_code: normalizeText(payment["Confirmation code"]) || null,
    reference_code: null,
    card_last4: cardLast4(payment.Card),
    raw_document: normalizeText(payment.Document) || null,
    description: normalizeText(payment.Description) || null,
    imported_at: new Date().toISOString(),
    import_metadata: {
      workiz_job_number: normalizeText(payment["Job ID"]),
      workiz_collected_by: normalizeText(payment["Collected by"]) || null,
      workiz_technician: normalizeText(payment.Technician) || null,
      source_file: payment._source_file,
    },
  };
}

function snapshotPayload(snapshot, requestId) {
  return {
    company_id: HOMEFIX_COMPANY_ID,
    service_request_id: requestId,
    source_system: "workiz",
    external_job_id: normalizeText(snapshot["Job #"]),
    subtotal: nullableNumber(snapshot.Subtotal),
    total: nullableNumber(snapshot.Total),
    cost: nullableNumber(snapshot.Cost),
    labor_cost: nullableNumber(snapshot["Labor cost"]),
    card_expenses: nullableNumber(snapshot["Card expenses"]),
    technician_expenses: nullableNumber(snapshot["Tech expenses"]),
    paid_amount: nullableNumber(snapshot["Paid amount"]),
    due_amount: nullableNumber(snapshot["Due amount"]),
    tax_amount: nullableNumber(snapshot["Tax amount"]),
    profit: nullableNumber(snapshot.Profit),
    tip_amount: nullableNumber(snapshot.Tip),
    invoice_number: null,
    snapshot_metadata: {
      workiz_status: normalizeText(snapshot.Status),
      workiz_type: normalizeText(snapshot.Type),
      workiz_technician: normalizeText(snapshot["Tech name"]) || null,
      source_file: snapshot._source_file,
    },
    imported_at: new Date().toISOString(),
  };
}

async function writePilotImport(supabase, dataset, existing, customerDecision) {
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for WRITE mode.");
  }
  if (customerDecision.action === "STOP") {
    throw new Error("Cannot write while customer match is ambiguous or unavailable.");
  }
  if (existing.technicianAmbiguous) {
    throw new Error("Cannot write with ambiguous technician match.");
  }

  let customerId = customerDecision.customer?.id ?? null;
  if (!customerId) {
    const { data, error } = await supabase.from("customers").insert(customerPayload(dataset)).select("id").single();
    if (error) throw new Error(`Customer insert failed: ${error.message}`);
    customerId = data.id;
  } else {
    const { error } = await supabase
      .from("customers")
      .update({
        source_system: "workiz",
        external_customer_id: AUTHORIZED_WORKIZ_CLIENT_ID,
        imported_at: new Date().toISOString(),
        import_metadata: customerPayload(dataset).import_metadata,
      })
      .eq("id", customerId);
    if (error) throw new Error(`Customer provenance update failed: ${error.message}`);
  }

  let addressId = existing.addressMatches[0]?.id ?? null;
  if (!addressId) {
    const { data, error } = await supabase.from("customer_addresses").insert(addressPayload(dataset, customerId)).select("id").single();
    if (error) throw new Error(`Address insert failed: ${error.message}`);
    addressId = data.id;
  }

  const requestByJob = new Map(existing.serviceRequests.map((request) => [request.external_job_id, request]));
  for (const job of dataset.jobs) {
    const jobId = normalizeText(job["Job #"]);
    if (!requestByJob.has(jobId)) {
      const { data, error } = await supabase
        .from("service_requests")
        .insert(serviceRequestPayload(job, customerId, addressId, existing.technicianMatch))
        .select("*")
        .single();
      if (error) throw new Error(`Job ${jobId} insert failed: ${error.message}`);
      requestByJob.set(jobId, data);
    }
  }

  for (const job of dataset.jobs) {
    const request = requestByJob.get(normalizeText(job["Job #"]));
    const scheduled = parseWorkizDate(job.Scheduled);
    const end = parseWorkizDate(job.End);
    if (!request || !scheduled || !end || normalizeKey(job.Tech) === "none" || !existing.technicianMatch) {
      continue;
    }
    const date = datePart(scheduled);
    const start = timePart(scheduled);
    const finish = timePart(end);
    const { data: existingAppointments, error: lookupError } = await supabase
      .from("appointments")
      .select("id")
      .eq("service_request_id", request.id)
      .eq("appointment_date", date)
      .eq("window_start_time", start)
      .eq("window_end_time", finish);
    if (lookupError) throw new Error(`Appointment lookup failed for job ${job["Job #"]}: ${lookupError.message}`);
    if ((existingAppointments ?? []).length > 0) {
      continue;
    }
    const { error } = await supabase.from("appointments").insert({
      company_id: HOMEFIX_COMPANY_ID,
      service_request_id: request.id,
      technician_profile_id: existing.technicianMatch.profile_id,
      appointment_date: date,
      window_start_time: start,
      window_end_time: finish,
      status: "completed",
      source: "manual",
      created_at: scheduled,
      updated_at: end,
    });
    if (error) throw new Error(`Appointment insert failed for job ${job["Job #"]}: ${error.message}`);
  }

  const estimateByKey = new Set(existing.estimates.map((estimate) => estimate.external_import_key));
  for (const estimate of dataset.estimates) {
    const key = makeImportKey("estimate", estimate["Estimate #"]);
    if (estimateByKey.has(key)) continue;
    const request = requestByJob.get(normalizeText(estimate.Job));
    const { error } = await supabase.from("service_request_estimates").insert(estimatePayload(estimate, request.id));
    if (error) throw new Error(`Estimate ${estimate["Estimate #"]} insert failed: ${error.message}`);
  }

  const invoiceByKey = new Map(existing.invoices.map((invoice) => [invoice.external_import_key, invoice]));
  for (const invoice of dataset.invoices) {
    const key = makeImportKey("invoice", invoice["Invoice NO."]);
    if (invoiceByKey.has(key)) continue;
    const request = requestByJob.get(normalizeText(invoice.Job));
    const { data, error } = await supabase.from("service_request_invoices").insert(invoicePayload(invoice, request.id)).select("*").single();
    if (error) throw new Error(`Invoice ${invoice["Invoice NO."]} insert failed: ${error.message}`);
    invoiceByKey.set(key, data);
  }

  const paymentByKey = new Set(existing.payments.map((payment) => payment.external_import_key));
  for (const payment of dataset.payments) {
    const key = makeImportKey("payment", payment._payment_identity);
    if (paymentByKey.has(key)) continue;
    const request = requestByJob.get(normalizeText(payment["Job ID"]));
    const jobInvoices = dataset.invoices.filter((invoice) => normalizeText(invoice.Job) === normalizeText(payment["Job ID"]));
    const invoiceId = jobInvoices.length === 1
      ? invoiceByKey.get(makeImportKey("invoice", jobInvoices[0]["Invoice NO."]))?.id ?? null
      : null;
    const { error } = await supabase.from("service_request_payments").insert(paymentPayload(payment, request.id, invoiceId));
    if (error) throw new Error(`Payment for job ${payment["Job ID"]} insert failed: ${error.message}`);
  }

  const snapshotJobs = new Set(existing.financialSnapshots.map((snapshot) => snapshot.external_job_id));
  for (const snapshot of dataset.financialSnapshots) {
    const jobId = normalizeText(snapshot["Job #"]);
    if (snapshotJobs.has(jobId)) continue;
    const request = requestByJob.get(jobId);
    const { error } = await supabase.from("service_request_financial_snapshots").insert(snapshotPayload(snapshot, request.id));
    if (error) throw new Error(`Financial snapshot for job ${jobId} insert failed: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dataset = buildDataset(args.csvDir);
  const validationErrors = validateDataset(dataset);
  const supabase = createSupabaseClient();
  const existing = await fetchExistingState(supabase, dataset);
  const customerDecision = decideCustomerMatch(existing);
  const report = buildReport(dataset, existing, validationErrors, customerDecision);

  console.log(report);

  const failed = validationErrors.length > 0 || customerDecision.action === "STOP" || existing.technicianAmbiguous;
  if (failed) {
    process.exitCode = 1;
    return;
  }

  if (!args.write) {
    console.log("\nZERO database writes occurred. Default mode is DRY RUN.");
    return;
  }

  await writePilotImport(supabase, dataset, existing, customerDecision);
  console.log("\nWRITE completed for authorized Workiz Client #1361 only.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
