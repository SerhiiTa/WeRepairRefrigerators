import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
const require = createRequire(resolve('frontend/package.json'));
const ts = require('typescript');
const React = require('react');
const base = 'frontend/src/components/dashboard/';
const source = readFileSync(base + 'ManualEstimateEditor.tsx', 'utf8');
const parent = readFileSync(base + 'ServiceRequestDetail.tsx', 'utf8');
const ast = ts.createSourceFile('editor.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function fn(name) {
  let result;
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) result = n.getText(ast); ts.forEachChild(n, visit); }
  visit(ast); assert.ok(result, name); return result;
}
function execute(code, scope = {}) {
  const js = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(scope), js)(...Object.values(scope));
}
function module(name, imports = {}) {
  const exports = {};
  execute(readFileSync(base + name, 'utf8'), { exports, require: (id) => imports[id] ?? require(id), React });
  return exports;
}
const helpers = module('estimate-item-actions.ts');
function fixture(overrides = {}) {
  const calls = []; const lines = [{ id: 'a', name: 'Part' }, { id: 'b', name: 'Labor' }];
  const scope = {
    lines, itemMutationRef: { current: false }, activeSavePromiseRef: { current: null }, saveState: { status: 'idle' },
    canEditFinancialFields: true, canStartAddItem: true, canReviseEstimate: true, estimateStatus: 'approved', savedEstimateId: 'e', savedEstimateNumber: 'E1',
    itemAction: (id, type) => lines.some(l => l.id === id) ? { type, lineIndex: 0, signatures: [] } : null,
    reviseForItem: async a => calls.push(['revise', a]), onReviseEstimate: async a => { calls.push(['transition', a]); return { ok: true }; },
    saveDraft: async v => { calls.push(['save', v]); return { id: 'e' }; },
    ...Object.fromEntries(['setLines', 'setItemDraft', 'setDeleteLineId', 'setOpenLineMenuId', 'setSwipedLineId', 'setIsItemMutating', 'setSaveState', 'setPendingAction'].map(k => [k, v => calls.push([k, v])])),
    ...overrides,
  };
  return { calls, scope, run: name => execute(`${fn(name)}; return ${name};`, scope) };
}
test('revision continuation maps new IDs and rejects changed, missing or reordered items', () => {
  const lines = [{ id: 'old1', name: 'A', amount: 4 }, { id: 'old2', name: 'B', amount: 8 }];
  const action = { type: 'delete', lineIndex: 1, signatures: lines.map(helpers.estimateItemSignature) };
  const revised = lines.map((l, i) => ({ ...l, id: 'new' + i }));
  assert.equal(helpers.resolveRevisedEstimateItem(revised, action).id, 'new1');
  assert.equal(helpers.resolveRevisedEstimateItem([...revised].reverse(), action), null);
  assert.equal(helpers.resolveRevisedEstimateItem([{ ...revised[0], amount: 9 }, revised[1]], action), null);
  assert.equal(helpers.resolveRevisedEstimateItem([], action), null);
});
test('request deletion only opens confirmation; stale IDs do nothing', () => {
  const f = fixture(); f.run('requestDeleteLine')('a');
  assert.deepEqual(f.calls.map(c => c[0]), ['setOpenLineMenuId', 'setSwipedLineId', 'setDeleteLineId']);
  f.calls.length = 0; f.run('requestDeleteLine')('stale'); assert.equal(f.calls.length, 0);
});
test('confirmed deletion saves once, refreshes lines only after success, and closes sheet', async () => {
  let finish; let count = 0;
  const f = fixture({ saveDraft: async options => { count++; assert.deepEqual(options.linesOverride.map(l => l.id), ['b']); return new Promise(r => { finish = r; }); } });
  const remove = f.run('deleteLine'); const pending = remove('a'); await remove('a');
  assert.equal(count, 1); assert.ok(!f.calls.some(c => c[0] === 'setLines'));
  finish({ id: 'e' }); await pending;
  assert.deepEqual(f.calls.find(c => c[0] === 'setLines')[1].map(l => l.id), ['b']);
  assert.ok(f.calls.some(c => c[0] === 'setItemDraft' && c[1] === null));
  assert.equal(f.scope.itemMutationRef.current, false);
});
test('failed save, stale ID and final item never remove local items', async () => {
  for (const overrides of [{ saveDraft: async () => null }, { saveDraft: async () => { throw Error(); } }, { lines: [{ id: 'a' }] }]) {
    const f = fixture(overrides); await f.run('deleteLine')('a');
    assert.ok(!f.calls.some(c => c[0] === 'setLines'));
  }
  const f = fixture(); await f.run('deleteLine')('stale'); assert.equal(f.calls.length, 0);
});
test('Approved Edit and Delete request existing revision before any item mutation', async () => {
  for (const name of ['openEditItem', 'deleteLine']) {
    const f = fixture({ canEditFinancialFields: false });
    await f.run(name)(name === 'openEditItem' ? f.scope.lines[0] : 'a');
    assert.deepEqual(f.calls.map(c => c[0]), ['revise']);
    assert.equal(f.calls[0][1].type, name === 'openEditItem' ? 'edit' : 'delete');
  }
});
test('failed authorized transition reports error without saving or changing items', async () => {
  const f = fixture({ onReviseEstimate: async () => ({ ok: false, message: 'Denied' }) });
  await f.run('reviseForItem')({ type: 'delete' });
  assert.ok(f.calls.some(c => c[0] === 'setSaveState' && c[1].message === 'Denied'));
  assert.ok(!f.calls.some(c => ['save', 'setLines'].includes(c[0])));
  assert.equal(f.scope.itemMutationRef.current, false);
});
test('Draft row edit opens existing sheet, Add Item still uses existing revision callback', async () => {
  const f = fixture(); f.run('openEditItem')(f.scope.lines[0]);
  assert.equal(f.calls.find(c => c[0] === 'setItemDraft')[1].mode, 'edit');
  assert.match(fn('startAddItem'), /await onReviseEstimate\([\s\S]*openAddItemType: type/);
  assert.match(parent, /itemAction: estimate.itemAction/);
  assert.match(parent, /pendingManualEstimateItemAction\?\.estimateId === manualEstimateId/);
});
function swipe(open = false, disabled = false) {
  const calls = [];
  const component = module('SwipeableEstimateItem.tsx', { react: { useRef: v => ({ current: v }) }, './estimate-item-actions': helpers }).SwipeableEstimateItem;
  const tree = component({ open, disabled, onOpenChange: v => calls.push(['open', v]), onDelete: () => calls.push(['delete']), children: null });
  const viewport = tree.props.children[0]; const [button, content] = viewport.props.children;
  const event = (x, y) => ({ clientX: x, clientY: y, isPrimary: true, button: 0, pointerId: 1, target: { closest: () => null }, currentTarget: { setPointerCapture() {} }, preventDefault() {}, stopPropagation() {} });
  const gesture = (x, y) => { content.props.onPointerDown(event(100, 100)); content.props.onPointerMove(event(x, y)); content.props.onPointerUp(event(x, y)); };
  return { calls, button, content, gesture };
}
test('swipe left reveals without deleting, right closes, vertical scroll and disabled rows preserved', () => {
  const f = swipe(); f.gesture(40, 102); assert.deepEqual(f.calls, [['open', true]]);
  let blocked = 0; f.content.props.onClickCapture({ preventDefault: () => blocked++, stopPropagation: () => blocked++ }); assert.equal(blocked, 2);
  assert.equal(f.content.props.style.touchAction, 'pan-y');
  const right = swipe(true); right.gesture(160, 101); assert.deepEqual(right.calls, [['open', false]]);
  for (const f of [swipe(), swipe(false, true)]) { f.gesture(98, 160); assert.deepEqual(f.calls, []); }
  const disabled = swipe(false, true); disabled.gesture(40, 100); assert.deepEqual(disabled.calls, []);
  f.button.props.onClick(); assert.deepEqual(f.calls.at(-1), ['delete']);
});
test('mobile targets, separate menu, one open swipe, sheet delete and confirmation wiring', () => {
  const mobile = source.slice(source.indexOf('<div className="divide-y divide-[#E5E7EB] lg:hidden">'), source.indexOf('Financial Summary</h3>'));
  assert.match(mobile, /data-item-menu[\s\S]*h-11 w-11/);
  assert.match(mobile, /event.stopPropagation\(\)/);
  assert.match(mobile, /open=\{swipedLineId === line.id\}/);
  assert.match(mobile, /onDelete=\{\(\) => requestDeleteLine\(line.id\)\}/);
  assert.match(source, /onDelete=\{itemDraft.mode === "edit"/);
  assert.match(fn('ManualEstimateItemSheet'), /lg:hidden[\s\S]*onClick=\{onDelete\}[\s\S]*Delete Item/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /onClick=\{\(\) => void deleteLine\(deleteLineId\)\}/);
  assert.match(source, /await onSaved\(/);
  assert.match(source, /calculateTotalsForLines/);
  assert.doesNotMatch(fn('deleteLine'), /fetch|invoice|payment|refund|approveEstimate/);
  const desktop = source.slice(source.indexOf('<div className="hidden lg:block">'), source.indexOf('<div className="divide-y divide-[#E5E7EB] lg:hidden">'));
  assert.doesNotMatch(desktop, /SwipeableEstimateItem|h-11 w-11/);
});
