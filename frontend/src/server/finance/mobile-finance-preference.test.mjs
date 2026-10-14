import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "../../../node_modules/typescript/lib/typescript.js";
const root = "frontend/src/components/dashboard/";
const source = readFileSync(root + "mobile-finance-preference.ts", "utf8");
const detail = readFileSync(root + "ServiceRequestDetail.tsx", "utf8");
const key = "homefixos.finance.mobile-ui.v1";
function load(storage = new Map(), { blocked = false, mobile = true, ssr = false } = {}) {
  const events = []; let applied = null;
  const window = {
    localStorage: {
      getItem: (k) => { if (blocked) throw Error("Unavailable"); return storage.get(k) ?? null; },
      setItem: (k,v) => { if (blocked) throw Error("Unavailable"); storage.set(k,v); },
    },
    dispatchEvent: (e) => events.push(e.type),
    matchMedia: () => ({ matches: mobile }),
  };
  const react = {
    useState: () => [applied, (v) => { applied = v; }],
    useSyncExternalStore: (_, snapshot, server) => ssr ? server() : snapshot(),
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "require", "window", "Event", code)(exports, () => react, ssr ? undefined : window, Event);
  return { api: exports, storage, events };
}
test("first visit defaults to Classic; explicit choices persist through refresh, restart and logout/login", () => {
  const f = load(); assert.equal(f.api.readMobileFinancePreference(), "classic");
  for (const value of ["new", "classic", "new"]) {
    assert.equal(f.api.saveMobileFinancePreference(value), true);
    assert.equal(f.storage.get(key), value);
    assert.equal(load(f.storage).api.readMobileFinancePreference(), value);
  }
  f.storage.set("auth-test", "session"); f.storage.delete("auth-test");
  assert.equal(load(f.storage).api.readMobileFinancePreference(), "new");
  assert.equal(load(new Map(f.storage)).api.readMobileFinancePreference(), "new");
  assert.equal(load().api.readMobileFinancePreference(), "classic");
  assert.equal(f.events.length, 3);
});
test("invalid values fall back safely; unavailable storage retains the current session choice without claiming persistence", () => {
  for (const value of ["", "unexpected", "NEW", "null"]) assert.equal(load(new Map([[key, value]])).api.readMobileFinancePreference(), "classic");
  const f = load(new Map(), { blocked: true });
  assert.equal(f.api.readMobileFinancePreference(), "classic");
  assert.equal(f.api.saveMobileFinancePreference("new"), false);
  assert.equal(f.api.readMobileFinancePreference(), "new");
});
test("SSR waits for the saved preference; hydrated New never renders Classic", () => {
  const ssr = load(new Map([[key, "new"]]), { ssr: true });
  assert.equal(ssr.api.useMobileFinancePreference(), null);
  assert.deepEqual(ssr.api.useMobileFinancePresentation(false), { ready: false, useClassicMobileFinance: false });
  const client = load(new Map([[key, "new"]]));
  assert.deepEqual(client.api.useMobileFinancePresentation(false), { ready: true, useClassicMobileFinance: false });
  assert.match(detail, /state.status === "loading" \|\| !financeVersionReady/);
});
test("active forms keep their applied version until a safe boundary; desktop ignores either choice", () => {
  for (const initial of ["classic", "new"]) {
    const f = load(new Map([[key, initial]]));
    const before = f.api.useMobileFinancePresentation(false);
    const next = initial === "classic" ? "new" : "classic";
    f.api.saveMobileFinancePreference(next);
    assert.deepEqual(f.api.useMobileFinancePresentation(true), before);
    assert.equal(f.api.useMobileFinancePresentation(false).useClassicMobileFinance, next === "classic");
    assert.equal(load(new Map([[key, initial]]), { mobile: false }).api.useMobileFinancePresentation(false).useClassicMobileFinance, false);
  }
  for (const name of ["isManualEstimateOverlayOpen", "isFinanceEstimateWorkflowOpen", "viewingInvoiceId", "isManualPaymentOpen", "manualPaymentVoidDraft", "paymentRefundDraft", "receiptDeliveryDraft", "invoiceDeliveryDraft"]) {
    const guard = detail.slice(detail.indexOf("= useMobileFinancePresentation("), detail.indexOf("  const readyRequestId"));
    assert.ok(guard.includes(name));
  }
  assert.doesNotMatch(source, /supabase|fetch\(|location\.reload|removeItem|clear\(/);
});
test("Dashboard contains one compact selector and no Job screen selector", () => {
  const page = readFileSync("frontend/src/app/dashboard/page.tsx", "utf8");
  const selector = readFileSync(root + "MobileFinanceSelector.tsx", "utf8");
  assert.equal((page.match(/<MobileFinanceSelector/g) ?? []).length, 1);
  assert.ok(selector.includes("Finance interface"));
  assert.ok(selector.includes('"Classic" : "New"'));
  assert.match(selector, /aria-pressed=\{version === option\}/);
  assert.doesNotMatch(detail, /<MobileFinanceSelector/);
});
const ast = ts.createSourceFile("detail.tsx", detail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result; function visit(n) { if (predicate(n)) result = n; ts.forEachChild(n, visit); } visit(ast); assert.ok(result); return result;
}
test("Classic and New overview/list branches share canonical values and existing collection handlers", () => {
  const branch = find((n) => ts.isConditionalExpression(n) && n.condition.getText(ast) === "useClassicMobileFinance" && n.whenFalse.getText(ast).includes('data-testid="mobile-finance-overview"'));
  const classic = branch.whenTrue.getText(ast), modern = branch.whenFalse.getText(ast);
  for (const text of ['financeApprovedTotal', 'financePaidTotal', 'financeBalanceDueTotal', 'financeEstimates.map(renderEstimateCard)', 'paymentHistory.map(renderPaymentHistoryItem)', 'openPaymentWorkflow()']) {
    assert.ok(classic.includes(text), text); assert.ok(modern.includes(text), text);
  }
  assert.ok(classic.includes('renderInvoiceSummaryCard(financePrimaryInvoice)'));
  assert.ok(modern.includes('renderMobileInvoiceCard(financePrimaryInvoice)'));
  assert.doesNotMatch(classic, /mobile-finance-overview|navigateMobileFinance/);
  assert.equal((detail.match(/\{isFinanceEstimateWorkflowOpen \? \(/g) ?? []).length, 1, 'Estimate builder remains shared');
});
test("both collection presentations dispatch to the current payment workflow and share the same draft", () => {
  const branch = find((n) => ts.isConditionalExpression(n) && n.condition.getText(ast) === "useClassicMobileFinance" && n.whenFalse.getText(ast).includes('data-testid="mobile-payment-continue"'));
  const classic = branch.whenTrue.getText(ast), modern = branch.whenFalse.getText(ast);
  for (const text of ['manualPaymentDraft', 'selectedManualPaymentTarget', 'updateManualPaymentTarget(target)', 'selectedManualPaymentTarget.cardActions.map', 'customDepositMode']) { assert.ok(classic.includes(text)); assert.ok(modern.includes(text)); }
  assert.match(classic, /saveManualPayment\(\)/); assert.doesNotMatch(classic, /mobilePaymentStep/);
  assert.match(modern, /submitMobilePayment\(\)/);
  assert.doesNotMatch(classic + modern, /fetch\(|\.rpc\(/);
  assert.equal((detail.match(/async function saveManualPayment\(/g) ?? []).length, 1);
});
