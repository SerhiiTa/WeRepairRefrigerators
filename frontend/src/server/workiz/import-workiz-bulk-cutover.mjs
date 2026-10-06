#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const HOMEFIX_COMPANY_ID = "f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633";
const DOWNLOADS_DIR = "/Users/serhiitatarenko/Downloads";
const DEFAULT_REPORT_DIR = "workiz-import-reports";
const WRITE_ALL_CONFIRMATION = "HOMEFIX-WORKIZ-HISTORICAL-CUTOVER";

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
    csvDir: DOWNLOADS_DIR,
    reportDir: DEFAULT_REPORT_DIR,
    writeAll: false,
    confirmCutover: null,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--write-all") {
      args.writeAll = true;
    } else if (arg.startsWith("--confirm-homefix-workiz-cutover=")) {
      args.confirmCutover = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--csv-dir=")) {
      args.csvDir = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--report-dir=")) {
      args.reportDir = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.writeAll && args.confirmCutover !== WRITE_ALL_CONFIRMATION) {
    throw new Error(`WRITE requires --confirm-homefix-workiz-cutover=${WRITE_ALL_CONFIRMATION}`);
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (insideQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
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

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers = [], ...records] = rows;
  return records
    .filter((record) => record.some((field) => field.trim()))
    .map((record) => {
      const parsed = {};
      headers.forEach((header, index) => {
        parsed[header] = record[index] ?? "";
      });
      return parsed;
    });
}

function readCsvFile(csvDir, fileName) {
  const filePath = resolve(csvDir, fileName);
  return parseCsv(readFileSync(filePath, "utf8")).map((row) => ({ ...row, _source_file: basename(fileName) }));
}

function readCsvGroup(csvDir, names) {
  return names.flatMap((name) => readCsvFile(csvDir, name));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value) {
  const digits = normalizeText(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits || "";
}

function phone10(value) {
  const digits = normalizePhone(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeMoney(value) {
  const cleaned = normalizeText(value).replace(/[$,]/g, "");
  if (!cleaned) return 0;
  return Number.parseFloat(cleaned) || 0;
}

function nullableNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return normalizeMoney(text);
}

function parseWorkizDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function datePart(iso) {
  return iso ? iso.slice(0, 10) : null;
}

function timePart(iso) {
  return iso ? iso.slice(11, 16) : null;
}

function makeImportKey(kind, id) {
  return `workiz:${kind}:${normalizeText(id)}`;
}

function splitName(name) {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "Unknown", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function parseAddress(value) {
  const raw = normalizeText(value);
  const parts = raw.split(",").map((part) => normalizeText(part)).filter(Boolean);
  let streetAddress = parts[0] || raw || "Unknown address";
  let city = parts[1] || "";
  let state = "";
  let zipCode = "";
  let country = "US";

  for (const part of parts.slice(2)) {
    const zip = part.match(/\b\d{5}(?:-\d{4})?\b/);
    if (zip) zipCode = zip[0];
    if (/\b[A-Z]{2}\b/.test(part)) state = part.match(/\b[A-Z]{2}\b/)?.[0] ?? state;
    if (/^US$|^USA$|United States/i.test(part)) country = "US";
  }

  if (!state && /\bTX\b/i.test(raw)) state = "TX";
  if (!zipCode) zipCode = raw.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? "";
  if (!city && parts.length >= 2) city = parts[1];
  if (!city) city = "Unknown";
  if (!zipCode) zipCode = "00000";

  streetAddress = streetAddress.replace(/\s+TX\s+\d{5}.*/i, "").trim();
  return { fullAddress: raw, streetAddress, city, state: state || "TX", zipCode, country };
}

function jobAddress(job) {
  const cityStateZip = [job.City, job.State, job["Zip code"]].map(normalizeText).filter(Boolean).join(", ");
  const fullAddress = [job.Address, cityStateZip].map(normalizeText).filter(Boolean).join(", ");
  return parseAddress(fullAddress || job.Address);
}

function addressIdentity(address) {
  return [
    normalizeKey(address.streetAddress),
    normalizeKey(address.city),
    normalizeKey(address.state),
    normalizeText(address.zipCode),
  ].join("|");
}

function dedupeBy(rows, getKey) {
  const seen = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!key || seen.has(key)) continue;
    seen.set(key, row);
  }
  return [...seen.values()];
}

function chunk(values, size = 50) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function mapServiceRequestStatus(status) {
  return STATUS_MAP.get(normalizeKey(status)) ?? "new";
}

function mapEstimateStatus(status) {
  return ESTIMATE_STATUS_MAP.get(normalizeKey(status)) ?? "draft";
}

function mapInvoiceStatus(status) {
  const key = normalizeKey(status);
  if (key.startsWith("paid")) return "paid";
  return INVOICE_STATUS_MAP.get(key) ?? "draft";
}

function mapPaymentStatus(status) {
  const key = normalizeKey(status);
  if (key.includes("refund")) return "refunded";
  if (key.includes("failed")) return "failed";
  return "succeeded";
}

function paymentIdentity(payment, index) {
  return [
    normalizeText(payment["Job ID"]),
    normalizeText(payment.Document),
    normalizeText(payment["Payment date"]),
    normalizeText(payment["Payment time"]),
    normalizeMoney(payment.Amount).toFixed(2),
    normalizeText(payment["Confirmation code"]),
    index,
  ].join("|");
}

function paymentSignatureFromWorkiz(payment) {
  return [
    normalizeText(payment["Job ID"]),
    normalizeMoney(payment.Amount).toFixed(2),
    normalizeText(payment["Payment date"]),
    normalizeText(payment["Payment time"]),
    normalizeText(payment["Payment type"]),
    normalizeText(payment["Transaction method"]),
    normalizeText(payment["Confirmation code"]),
  ].join("|");
}

function paymentSignatureFromImported(payment, requestById) {
  const request = requestById.get(payment.service_request_id);
  return [
    normalizeText(request?.external_job_id),
    normalizeMoney(payment.amount).toFixed(2),
    normalizeText(payment.payment_date),
    normalizeText(payment.paid_at).slice(11, 16),
    normalizeText(payment.payment_type),
    normalizeText(payment.payment_method),
    normalizeText(payment.confirmation_code),
  ].join("|");
}

function legacyPaymentBaseFromWorkiz(payment) {
  return [
    normalizeText(payment["Job ID"]),
    normalizeText(payment.Document),
    normalizeText(payment["Payment date"]),
    normalizeText(payment["Payment time"]).replace(/:/g, "-"),
    normalizeMoney(payment.Amount).toFixed(2),
    normalizeText(payment["Confirmation code"]),
  ].join(":");
}

function legacyPaymentBaseFromImported(payment) {
  const id = normalizeText(payment.external_payment_id);
  return id ? id.replace(/:\d+$/, "") : "";
}

function cardLast4(value) {
  const match = normalizeText(value).match(/(\d{4})\D*$/);
  return match ? match[1] : null;
}

function buildCustomerIndex(customers) {
  const byClientId = new Map();
  const byPhone = new Map();
  const byEmail = new Map();
  const byName = new Map();

  for (const customer of customers) {
    const clientId = normalizeText(customer["Client #"]);
    if (clientId) byClientId.set(clientId, customer);
    const phone = phone10(customer.Phone);
    const email = normalizeKey(customer.Email);
    const name = normalizeKey(customer.Name);
    if (phone) {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(customer);
    }
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(customer);
    }
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(customer);
    }
  }

  return { byClientId, byPhone, byEmail, byName };
}

function resolveJobCustomer(job, customerIndex) {
  const candidates = new Map();
  const addCandidate = (customer, reason, weight) => {
    if (!customer) return;
    const clientId = normalizeText(customer["Client #"]);
    if (!clientId) return;
    const existing = candidates.get(clientId) ?? { customer, score: 0, reasons: [] };
    existing.score += weight;
    existing.reasons.push(reason);
    candidates.set(clientId, existing);
  };

  for (const customer of customerIndex.byPhone.get(phone10(job.Phone)) ?? []) addCandidate(customer, "phone", 3);
  for (const customer of customerIndex.byEmail.get(normalizeKey(job.Email)) ?? []) addCandidate(customer, "email", 3);
  for (const customer of customerIndex.byName.get(normalizeKey(job.Client)) ?? []) addCandidate(customer, "name", 1);

  const ranked = [...candidates.values()].sort((left, right) => right.score - left.score);
  if (ranked.length === 0) {
    return { customer: null, confidence: "LOW", reason: "no customer match" };
  }
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return { customer: null, confidence: "LOW", reason: "ambiguous equal-score customer matches" };
  }
  const best = ranked[0];
  const confidence = best.score >= 4 ? "HIGH" : best.score >= 3 ? "MEDIUM" : "LOW";
  return { customer: best.customer, confidence, reason: best.reasons.join("+") };
}

function buildDataset(csvDir) {
  const customers = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.customers), (row) => normalizeText(row["Client #"]));
  const jobs = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.jobs), (row) => normalizeText(row["Job #"]))
    .filter((job) => normalizeText(job["Job #"]))
    .sort((left, right) => Number(left["Job #"]) - Number(right["Job #"]));
  const jobIds = new Set(jobs.map((job) => normalizeText(job["Job #"])));
  const estimates = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.estimates), (row) => normalizeText(row["Estimate #"]))
    .filter((estimate) => jobIds.has(normalizeText(estimate.Job)));
  const invoices = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.invoices), (row) => normalizeText(row["Invoice NO."]))
    .filter((invoice) => jobIds.has(normalizeText(invoice.Job)));
  const payments = readCsvGroup(csvDir, SOURCE_FILES.payments)
    .filter((payment) => jobIds.has(normalizeText(payment["Job ID"])))
    .map((payment, index) => ({ ...payment, _payment_identity: paymentIdentity(payment, index) }));
  const financialSnapshots = dedupeBy(readCsvGroup(csvDir, SOURCE_FILES.financialSnapshots), (row) => normalizeText(row["Job #"]))
    .filter((snapshot) => jobIds.has(normalizeText(snapshot["Job #"])));

  const customerIndex = buildCustomerIndex(customers);
  const jobAssignments = new Map();
  const customerJobs = new Map();
  const unresolvedJobs = [];

  for (const job of jobs) {
    const result = resolveJobCustomer(job, customerIndex);
    const jobId = normalizeText(job["Job #"]);
    if (!result.customer || result.confidence === "LOW") {
      unresolvedJobs.push({ jobId, client: normalizeText(job.Client), reason: result.reason, confidence: result.confidence });
      continue;
    }
    const clientId = normalizeText(result.customer["Client #"]);
    jobAssignments.set(jobId, { clientId, confidence: result.confidence, reason: result.reason });
    if (!customerJobs.has(clientId)) customerJobs.set(clientId, []);
    customerJobs.get(clientId).push(job);
  }

  const customerAddresses = new Map();
  for (const customer of customers) {
    const clientId = normalizeText(customer["Client #"]);
    const addresses = new Map();
    const customerAddress = parseAddress(customer.Address);
    addresses.set(addressIdentity(customerAddress), customerAddress);
    for (const job of customerJobs.get(clientId) ?? []) {
      const parsed = jobAddress(job);
      if (parsed.fullAddress) addresses.set(addressIdentity(parsed), parsed);
    }
    customerAddresses.set(clientId, [...addresses.values()]);
  }

  return {
    customers,
    jobs,
    estimates,
    invoices,
    payments,
    financialSnapshots,
    jobAssignments,
    customerJobs,
    customerAddresses,
    unresolvedJobs,
  };
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

async function selectInChunks(supabase, table, select, column, values, apply = (query) => query) {
  const rows = [];
  const uniqueValues = [...new Set(values.filter(Boolean))];
  for (const part of chunk(uniqueValues)) {
    if (part.length === 0) continue;
    const { data, error } = await apply(supabase.from(table).select(select).in(column, part));
    if (error) throw new Error(`${table} lookup failed: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function fetchExistingState(supabase, dataset) {
  if (!supabase) {
    return { dbAvailable: false };
  }

  const clientIds = dataset.customers.map((customer) => normalizeText(customer["Client #"]));
  const jobIds = dataset.jobs.map((job) => normalizeText(job["Job #"]));
  const estimateKeys = dataset.estimates.map((estimate) => makeImportKey("estimate", estimate["Estimate #"]));
  const invoiceKeys = dataset.invoices.map((invoice) => makeImportKey("invoice", invoice["Invoice NO."]));
  const paymentKeys = dataset.payments.map((payment) => makeImportKey("payment", payment._payment_identity));

  const [
    customers,
    serviceRequests,
    estimates,
    invoices,
    payments,
    snapshots,
    technicians,
  ] = await Promise.all([
    selectInChunks(supabase, "customers", "*", "external_customer_id", clientIds, (query) =>
      query.eq("company_id", HOMEFIX_COMPANY_ID).eq("source_system", "workiz"),
    ),
    selectInChunks(supabase, "service_requests", "*", "external_job_id", jobIds, (query) =>
      query.eq("company_id", HOMEFIX_COMPANY_ID).eq("source_system", "workiz"),
    ),
    selectInChunks(supabase, "service_request_estimates", "*", "external_import_key", estimateKeys),
    selectInChunks(supabase, "service_request_invoices", "*", "external_import_key", invoiceKeys),
    selectInChunks(supabase, "service_request_payments", "*", "external_import_key", paymentKeys),
    selectInChunks(supabase, "service_request_financial_snapshots", "*", "external_job_id", jobIds, (query) =>
      query.eq("company_id", HOMEFIX_COMPANY_ID).eq("source_system", "workiz"),
    ),
    supabase.from("technician_profiles").select("*").eq("company_id", HOMEFIX_COMPANY_ID),
  ]);

  if (technicians.error) {
    throw new Error(`Technician lookup failed: ${technicians.error.message}`);
  }

  const serviceRequestIds = serviceRequests.map((request) => request.id);
  const appointments = await selectInChunks(supabase, "appointments", "*", "service_request_id", serviceRequestIds);
  const paymentsByExistingRequest = await selectInChunks(
    supabase,
    "service_request_payments",
    "*",
    "service_request_id",
    serviceRequestIds,
  );
  const customerIds = customers.map((customer) => customer.id);
  const addresses = await selectInChunks(supabase, "customer_addresses", "*", "customer_id", customerIds, (query) =>
    query.eq("company_id", HOMEFIX_COMPANY_ID),
  );

  return {
    dbAvailable: true,
    customers,
    addresses,
    serviceRequests,
    estimates,
    invoices,
    payments: dedupeBy([...payments, ...paymentsByExistingRequest], (payment) => payment.id),
    financialSnapshots: snapshots,
    appointments,
    technicians: technicians.data ?? [],
  };
}

function technicianDisplayName(technician) {
  return normalizeText(technician.display_name || technician.business_name || technician.name);
}

function buildTechnicianResolution(dataset, existing) {
  const workizNames = [...new Set(dataset.jobs.map((job) => normalizeText(job.Tech)).filter((name) => name && normalizeKey(name) !== "none"))].sort();
  const byName = new Map();
  for (const technician of existing.technicians ?? []) {
    const names = [technician.display_name, technician.business_name].map(normalizeKey).filter(Boolean);
    for (const name of names) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(technician);
    }
  }

  const matched = [];
  const unresolved = [];
  const ambiguous = [];
  for (const name of workizNames) {
    const candidates = byName.get(normalizeKey(name)) ?? [];
    if (candidates.length === 1) {
      matched.push({ workizName: name, profileId: candidates[0].profile_id, displayName: technicianDisplayName(candidates[0]) });
    } else if (candidates.length > 1) {
      ambiguous.push({ workizName: name, matches: candidates.map((candidate) => candidate.profile_id) });
    } else {
      unresolved.push(name);
    }
  }
  return { matched, unresolved, ambiguous };
}

function findAddressMatch(addresses, address) {
  return addresses.find((row) => (
    normalizeKey(row.street_address) === normalizeKey(address.streetAddress) &&
    normalizeKey(row.city) === normalizeKey(address.city) &&
    normalizeKey(row.state) === normalizeKey(address.state) &&
    normalizeText(row.zip_code) === normalizeText(address.zipCode)
  ));
}

function buildPlan(dataset, existing) {
  const customerByClientId = new Map((existing.customers ?? []).map((customer) => [customer.external_customer_id, customer]));
  const requestByJobId = new Map((existing.serviceRequests ?? []).map((request) => [request.external_job_id, request]));
  const requestById = new Map((existing.serviceRequests ?? []).map((request) => [request.id, request]));
  const estimateByKey = new Set((existing.estimates ?? []).map((estimate) => estimate.external_import_key));
  const invoiceByKey = new Set((existing.invoices ?? []).map((invoice) => invoice.external_import_key));
  const paymentByKey = new Set((existing.payments ?? []).map((payment) => payment.external_import_key));
  const paymentBySignature = new Set((existing.payments ?? []).map((payment) => paymentSignatureFromImported(payment, requestById)));
  const legacyPaymentByBase = new Set((existing.payments ?? []).map(legacyPaymentBaseFromImported).filter(Boolean));
  const existingPaymentCountByJob = new Map();
  for (const payment of existing.payments ?? []) {
    const jobId = normalizeText(requestById.get(payment.service_request_id)?.external_job_id);
    if (!jobId) continue;
    existingPaymentCountByJob.set(jobId, (existingPaymentCountByJob.get(jobId) ?? 0) + 1);
  }
  const sourcePaymentCountByJob = new Map();
  for (const payment of dataset.payments) {
    const jobId = normalizeText(payment["Job ID"]);
    sourcePaymentCountByJob.set(jobId, (sourcePaymentCountByJob.get(jobId) ?? 0) + 1);
  }
  const snapshotByJobId = new Set((existing.financialSnapshots ?? []).map((snapshot) => snapshot.external_job_id));
  const addressesByCustomerId = new Map();
  for (const address of existing.addresses ?? []) {
    if (!addressesByCustomerId.has(address.customer_id)) addressesByCustomerId.set(address.customer_id, []);
    addressesByCustomerId.get(address.customer_id).push(address);
  }

  const customers = { create: [], existing: [], unresolved: [] };
  const addresses = { create: [], existing: [] };
  const jobs = { create: [], existing: [], unresolved: dataset.unresolvedJobs };
  const appointments = { create: [], existing: [], skipped: [] };
  const estimates = { create: [], existing: [], unresolved: [] };
  const invoices = { create: [], existing: [], unresolved: [] };
  const payments = { create: [], existing: [], unresolved: [] };
  const financialSnapshots = { create: [], existing: [], unresolved: [] };

  for (const customer of dataset.customers) {
    const clientId = normalizeText(customer["Client #"]);
    const existingCustomer = customerByClientId.get(clientId);
    if (existingCustomer) customers.existing.push({ clientId, id: existingCustomer.id, name: normalizeText(customer.Name) });
    else customers.create.push({ clientId, name: normalizeText(customer.Name) });

    const dbAddresses = existingCustomer ? addressesByCustomerId.get(existingCustomer.id) ?? [] : [];
    for (const address of dataset.customerAddresses.get(clientId) ?? []) {
      const matched = findAddressMatch(dbAddresses, address);
      if (matched) addresses.existing.push({ clientId, id: matched.id, identity: addressIdentity(address) });
      else addresses.create.push({ clientId, identity: addressIdentity(address), address });
    }
  }

  for (const job of dataset.jobs) {
    const jobId = normalizeText(job["Job #"]);
    const assignment = dataset.jobAssignments.get(jobId);
    if (!assignment) continue;
    const existingRequest = requestByJobId.get(jobId);
    if (existingRequest) jobs.existing.push({ jobId, id: existingRequest.id, clientId: assignment.clientId });
    else jobs.create.push({ jobId, clientId: assignment.clientId, status: mapServiceRequestStatus(job.Status), requestSource: "other" });

    const scheduled = parseWorkizDate(job.Scheduled);
    const end = parseWorkizDate(job.End);
    if (!scheduled || !end || normalizeKey(job.Tech) === "none" || !normalizeText(job.Tech)) {
      appointments.skipped.push({ jobId, reason: "missing schedule/end/technician" });
    } else {
      const existingAppointment = (existing.appointments ?? []).find((appointment) => {
        const request = requestByJobId.get(jobId);
        return request && appointment.service_request_id === request.id &&
          appointment.appointment_date === datePart(scheduled) &&
          appointment.window_start_time === timePart(scheduled) &&
          appointment.window_end_time === timePart(end);
      });
      if (existingAppointment) appointments.existing.push({ jobId, id: existingAppointment.id });
      else appointments.create.push({ jobId, technician: normalizeText(job.Tech) });
    }
  }

  for (const estimate of dataset.estimates) {
    const key = makeImportKey("estimate", estimate["Estimate #"]);
    const jobId = normalizeText(estimate.Job);
    if (!dataset.jobAssignments.has(jobId)) estimates.unresolved.push({ key, jobId });
    else if (estimateByKey.has(key)) estimates.existing.push({ key, jobId });
    else estimates.create.push({ key, jobId });
  }

  for (const invoice of dataset.invoices) {
    const key = makeImportKey("invoice", invoice["Invoice NO."]);
    const jobId = normalizeText(invoice.Job);
    if (!dataset.jobAssignments.has(jobId)) invoices.unresolved.push({ key, jobId });
    else if (invoiceByKey.has(key)) invoices.existing.push({ key, jobId });
    else invoices.create.push({ key, jobId });
  }

  for (const payment of dataset.payments) {
    const key = makeImportKey("payment", payment._payment_identity);
    const jobId = normalizeText(payment["Job ID"]);
    if (!dataset.jobAssignments.has(jobId)) payments.unresolved.push({ key, jobId });
    else if (
      paymentByKey.has(key) ||
      paymentBySignature.has(paymentSignatureFromWorkiz(payment)) ||
      legacyPaymentByBase.has(legacyPaymentBaseFromWorkiz(payment)) ||
      (requestByJobId.has(jobId) && (existingPaymentCountByJob.get(jobId) ?? 0) >= (sourcePaymentCountByJob.get(jobId) ?? 0))
    ) payments.existing.push({ key, jobId });
    else payments.create.push({ key, jobId });
  }

  for (const snapshot of dataset.financialSnapshots) {
    const jobId = normalizeText(snapshot["Job #"]);
    if (!dataset.jobAssignments.has(jobId)) financialSnapshots.unresolved.push({ jobId });
    else if (snapshotByJobId.has(jobId)) financialSnapshots.existing.push({ jobId });
    else financialSnapshots.create.push({ jobId });
  }

  return { customers, addresses, jobs, appointments, estimates, invoices, payments, financialSnapshots };
}

function summarizeStatuses(dataset) {
  const counts = new Map();
  for (const job of dataset.jobs) {
    const raw = normalizeText(job.Status) || "(blank)";
    const mapped = mapServiceRequestStatus(job.Status);
    const key = `${raw} -> ${mapped}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([mapping, count]) => ({ mapping, count })).sort((a, b) => a.mapping.localeCompare(b.mapping));
}

function financialSummary(dataset) {
  const invoiced = dataset.invoices.reduce((sum, invoice) => sum + normalizeMoney(invoice["Total Amount"]), 0);
  const paid = dataset.payments.reduce((sum, payment) => sum + normalizeMoney(payment.Amount), 0);
  const due = dataset.financialSnapshots.reduce((sum, snapshot) => sum + normalizeMoney(snapshot["Due amount"]), 0);
  const tips = dataset.payments.reduce((sum, payment) => sum + normalizeMoney(payment.Tips), 0);
  const methods = [...new Set(dataset.payments.map((payment) => normalizeText(payment["Payment type"] || "Unknown")))].sort();
  return { invoiced, paid, due, tips, methods };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function buildManifest(dataset, existing, plan, technicianResolution, args) {
  const summary = financialSummary(dataset);
  const unresolved = {
    jobs: plan.jobs.unresolved,
    estimates: plan.estimates.unresolved,
    invoices: plan.invoices.unresolved,
    payments: plan.payments.unresolved,
    financialSnapshots: plan.financialSnapshots.unresolved,
    technicians: technicianResolution.unresolved,
    technicianAmbiguities: technicianResolution.ambiguous,
  };
  const hasBlockingUnresolved =
    plan.jobs.unresolved.length > 0 ||
    plan.estimates.unresolved.length > 0 ||
    plan.invoices.unresolved.length > 0 ||
    plan.payments.unresolved.length > 0 ||
    plan.financialSnapshots.unresolved.length > 0 ||
    technicianResolution.ambiguous.length > 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: args.writeAll ? "WRITE_ALL" : "DRY_RUN",
    homefixCompanyId: HOMEFIX_COMPANY_ID,
    sourceFiles: SOURCE_FILES,
    zeroWrites: !args.writeAll,
    sourceCounts: {
      customers: dataset.customers.length,
      jobs: dataset.jobs.length,
      estimates: dataset.estimates.length,
      invoices: dataset.invoices.length,
      payments: dataset.payments.length,
      financialSnapshots: dataset.financialSnapshots.length,
    },
    existingCounts: {
      customers: plan.customers.existing.length,
      addresses: plan.addresses.existing.length,
      jobs: plan.jobs.existing.length,
      appointments: plan.appointments.existing.length,
      estimates: plan.estimates.existing.length,
      invoices: plan.invoices.existing.length,
      payments: plan.payments.existing.length,
      financialSnapshots: plan.financialSnapshots.existing.length,
    },
    createCounts: {
      customers: plan.customers.create.length,
      addresses: plan.addresses.create.length,
      jobs: plan.jobs.create.length,
      appointments: plan.appointments.create.length,
      estimates: plan.estimates.create.length,
      invoices: plan.invoices.create.length,
      payments: plan.payments.create.length,
      financialSnapshots: plan.financialSnapshots.create.length,
    },
    skippedCounts: {
      appointments: plan.appointments.skipped.length,
    },
    unresolvedCounts: {
      jobs: plan.jobs.unresolved.length,
      estimates: plan.estimates.unresolved.length,
      invoices: plan.invoices.unresolved.length,
      payments: plan.payments.unresolved.length,
      financialSnapshots: plan.financialSnapshots.unresolved.length,
      technicians: technicianResolution.unresolved.length,
      technicianAmbiguities: technicianResolution.ambiguous.length,
    },
    customerMatching: {
      matchedByWorkizProvenance: plan.customers.existing.length,
      create: plan.customers.create.length,
      unresolved: plan.customers.unresolved.length,
    },
    jobMatching: {
      highConfidence: [...dataset.jobAssignments.values()].filter((assignment) => assignment.confidence === "HIGH").length,
      mediumConfidence: [...dataset.jobAssignments.values()].filter((assignment) => assignment.confidence === "MEDIUM").length,
      lowOrUnresolved: dataset.unresolvedJobs.length,
    },
    technicianResolution,
    statusMappings: summarizeStatuses(dataset),
    financialSummary: {
      invoiced: summary.invoiced,
      paid: summary.paid,
      due: summary.due,
      tips: summary.tips,
      methods: summary.methods,
    },
    stevenWolfIdempotency: {
      clientId: "1361",
      customerExisting: plan.customers.existing.some((customer) => customer.clientId === "1361"),
      jobsExisting: plan.jobs.existing.filter((job) => job.clientId === "1361").length,
    },
    unresolved,
    cutoverReady: !hasBlockingUnresolved,
  };
}

function markdownReport(manifest) {
  const lines = [];
  lines.push("# Workiz Bulk Import Dry Run");
  lines.push("");
  lines.push(`Generated: ${manifest.generatedAt}`);
  lines.push(`Mode: ${manifest.mode}`);
  lines.push(`Zero writes: ${manifest.zeroWrites ? "YES" : "NO"}`);
  lines.push("");
  lines.push("## Source Counts");
  for (const [key, value] of Object.entries(manifest.sourceCounts)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Existing In WRA");
  for (const [key, value] of Object.entries(manifest.existingCounts)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Would Create");
  for (const [key, value] of Object.entries(manifest.createCounts)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Skipped");
  for (const [key, value] of Object.entries(manifest.skippedCounts)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Unresolved");
  for (const [key, value] of Object.entries(manifest.unresolvedCounts)) lines.push(`- ${key}: ${value}`);
  lines.push("");
  lines.push("## Matching");
  lines.push(`- job high confidence: ${manifest.jobMatching.highConfidence}`);
  lines.push(`- job medium confidence: ${manifest.jobMatching.mediumConfidence}`);
  lines.push(`- job unresolved/low confidence: ${manifest.jobMatching.lowOrUnresolved}`);
  lines.push(`- technician matched: ${manifest.technicianResolution.matched.length}`);
  lines.push(`- technician unresolved: ${manifest.technicianResolution.unresolved.length}`);
  lines.push("");
  lines.push("## Status Mapping");
  for (const item of manifest.statusMappings) lines.push(`- ${item.mapping}: ${item.count}`);
  lines.push("");
  lines.push("## Financial Summary");
  lines.push(`- historical invoiced total: ${formatMoney(manifest.financialSummary.invoiced)}`);
  lines.push(`- historical paid amount: ${formatMoney(manifest.financialSummary.paid)}`);
  lines.push(`- historical due amount: ${formatMoney(manifest.financialSummary.due)}`);
  lines.push(`- tips: ${formatMoney(manifest.financialSummary.tips)}`);
  lines.push(`- payment methods: ${manifest.financialSummary.methods.join(", ") || "none"}`);
  lines.push("");
  lines.push("## Steven Wolf Idempotency");
  lines.push(`- customer existing: ${manifest.stevenWolfIdempotency.customerExisting ? "YES" : "NO"}`);
  lines.push(`- existing jobs: ${manifest.stevenWolfIdempotency.jobsExisting}`);
  lines.push("");
  lines.push(`## Verdict: ${manifest.cutoverReady ? "CUTOVER READY" : "NOT CUTOVER READY"}`);
  return `${lines.join("\n")}\n`;
}

function writeReports(reportDir, manifest) {
  mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = resolve(reportDir, `workiz-bulk-dry-run-${stamp}.json`);
  const mdPath = resolve(reportDir, `workiz-bulk-dry-run-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdownReport(manifest), "utf8");
  return { jsonPath, mdPath };
}

function customerPayload(customer) {
  const clientId = normalizeText(customer["Client #"]);
  const { firstName, lastName } = splitName(customer.Name);
  return {
    company_id: HOMEFIX_COMPANY_ID,
    first_name: firstName,
    last_name: lastName,
    full_name: normalizeText(customer.Name),
    phone: normalizePhone(customer.Phone) || null,
    email: normalizeKey(customer.Email) || null,
    preferred_contact_method: "phone",
    customer_status: "active",
    source_system: "workiz",
    external_customer_id: clientId,
    imported_at: new Date().toISOString(),
    import_metadata: {
      workiz_client_number: clientId,
      workiz_created: customer.Created,
      workiz_ad_source: customer["Ad Source"] || null,
      workiz_service_plan: customer["Service Plan"] || null,
      source_file: customer._source_file,
    },
    created_at: parseWorkizDate(customer.Created) ?? new Date().toISOString(),
  };
}

function addressPayload(customer, address, customerId, index) {
  const clientId = normalizeText(customer["Client #"]);
  return {
    company_id: HOMEFIX_COMPANY_ID,
    customer_id: customerId,
    label: index === 0 ? "Workiz historical address" : `Workiz historical address ${index + 1}`,
    street_address: address.streetAddress,
    city: address.city,
    state: address.state || "TX",
    zip_code: address.zipCode,
    country: address.country || "US",
    is_primary: index === 0,
    source_system: "workiz",
    external_address_key: makeImportKey("customer-address", `${clientId}:${addressIdentity(address)}`),
    imported_at: new Date().toISOString(),
    import_metadata: { workiz_raw_address: address.fullAddress || customer.Address },
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
    customer_name: normalizeText(job.Client) || "Workiz customer",
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
    assigned_technician_profile_id: technicianProfile?.profile_id ?? null,
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

async function writeBulkImport() {
  throw new Error("Bulk WRITE path is intentionally blocked until owner reviews a passing full dry-run manifest.");
}

async function main() {
  const args = parseArgs(process.argv);
  const dataset = buildDataset(args.csvDir);
  const supabase = createSupabaseClient();
  const existing = await fetchExistingState(supabase, dataset);
  const technicianResolution = buildTechnicianResolution(dataset, existing);
  const plan = buildPlan(dataset, existing);
  const manifest = buildManifest(dataset, existing, plan, technicianResolution, args);
  const reportPaths = writeReports(args.reportDir, manifest);

  console.log(markdownReport(manifest));
  console.log(`JSON manifest: ${reportPaths.jsonPath}`);
  console.log(`Markdown report: ${reportPaths.mdPath}`);

  if (!args.writeAll) {
    console.log("\nZERO database writes occurred. Default mode is DRY RUN.");
    return;
  }

  await writeBulkImport();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
