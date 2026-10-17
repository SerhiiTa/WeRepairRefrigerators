const PATH = '/dashboard/communications';
export const HUB_NAVIGATION_EVENT = 'wra:communications-navigation';
export type HubTab = 'conversation' | 'activity' | 'customer' | 'job' | 'lead';
export function hubTab(value: string | null): HubTab {
  return value === 'activity' || value === 'customer' || value === 'job' || value === 'lead' ? value : 'conversation';
}
export function hubDestination(search: string, changes: Record<string, string | null>) {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key); else params.set(key, value);
  }
  if (params.get('view') !== 'detail' || !(params.get('conversation') || params.get('customer'))) {
    params.delete('view'); params.delete('tab'); params.delete('conversation');
  } else if (hubTab(params.get('tab')) === 'conversation') params.delete('tab');
  params.sort();
  return PATH + (params.size ? `?${params}` : '');
}
// Only entries created here establish a known path back to the list. Preserve Next's state.
export function navigateHub(win: Window, changes: Record<string, string | null>, mode: 'push' | 'replace' = 'push') {
  const current = hubDestination(win.location.search, {});
  const next = hubDestination(win.location.search, changes);
  if (current === next) return false;
  const saved = win.history.state?.wraHub;
  const depth = saved?.url === current && Number.isInteger(saved.depth) && saved.depth >= 0 ? saved.depth : 0;
  const hasList = saved?.url === current ? saved.hasList === true : !new URL(current, win.location.origin).searchParams.has('view');
  const nextIsList = !new URL(next, win.location.origin).searchParams.has('view');
  const state = { ...win.history.state, wraHub: { url: next, depth: nextIsList ? 0 : mode === 'push' ? depth + 1 : depth, hasList: nextIsList || hasList, origin: saved?.origin ?? null } };
  win.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', next);
  win.dispatchEvent(new Event(HUB_NAVIGATION_EVENT));
  return true;
}
export function backToHubList(win: Window) {
  const origin = workspaceReturnTo(new URLSearchParams(win.location.search).get('returnTo'));
  if (origin) {
    const entry = win.history.state?.wraHub;
    if (entry?.origin === origin && entry.url === hubDestination(win.location.search, {}) && Number.isInteger(entry.depth) && entry.depth >= 0) win.history.go(-entry.depth - 1);
    else win.location.replace(origin);
    return;
  }
  const saved = win.history.state?.wraHub;
  const current = hubDestination(win.location.search, {});
  if (saved?.url === current && saved.hasList === true && Number.isInteger(saved.depth) && saved.depth > 0) {
    win.history.go(-saved.depth);
  } else navigateHub(win, { conversation: null, customer: null, job: null, returnTo: null, view: null, tab: null }, 'replace');
}
export function saveHubScroll(win: Window, panel: string, top: number) {
  try { win.sessionStorage.setItem(`wra-hub-scroll:${hubDestination(win.location.search, {})}:${panel}`, String(top)); } catch { /* Optional restoration. */ }
}
export function readHubScroll(win: Window, panel: string) {
  try { const n = Number(win.sessionStorage.getItem(`wra-hub-scroll:${hubDestination(win.location.search, {})}:${panel}`)); return Number.isFinite(n) && n >= 0 ? n : 0; } catch { return 0; }
}

// Return targets are workspace pages only; never accept external or encoded paths.
export function workspaceReturnTo(value: string | null): string | null {
  if (!value || /[\\\s\x00-\x1f]/.test(value)) return null;
  const match = value.match(/^\/dashboard\/(customers|leads)\/([a-f0-9-]{36})(\?[^#]*)?$/i);
  if (!match || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(match[2])) return null;
  const url = new URL(value, 'https://workspace.invalid');
  url.searchParams.delete('returnTo');
  return url.pathname + url.search;
}
export function customerCommunicationsHref(customerId: string, jobId?: string, returnTo?: string) {
  const params = new URLSearchParams({ customer: customerId, view: 'detail' });
  if (jobId) params.set('job', jobId);
  const safe = workspaceReturnTo(returnTo ?? null);
  if (safe) params.set('returnTo', safe);
  return `${PATH}?${params}`;
}

// The caller MUST pass the authenticated browser client. Every read retains RLS.
export async function resolveCustomerThread(
  db: import('@supabase/supabase-js').SupabaseClient<import('@/lib/supabase/types').Database>,
  input: { customer: string | null; job: string | null; conversation: string | null },
) {
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (Object.values(input).some(value => value && !uuid.test(value))) throw new Error('Conversation context is unavailable.');
  let customer = input.customer;
  let company: string | null = null;
  let direct = null;
  if (input.job) {
    const job = await db.from('service_requests').select('id,customer_id,company_id').eq('id', input.job).maybeSingle();
    // Existing read-only RPC is absent from the generated client type catalog.
    const accessClient = db as unknown as { rpc(name: 'can_view_service_request', args: { target_service_request_id: string }): PromiseLike<{ data: boolean | null; error: unknown }> };
    const access = await accessClient.rpc('can_view_service_request', { target_service_request_id: input.job });
    if (job.error || !job.data?.company_id || !job.data.customer_id || access.error || access.data !== true || (customer && customer !== job.data.customer_id)) throw new Error('Job conversation is unavailable.');
    customer = job.data.customer_id; company = job.data.company_id;
  }
  if (input.conversation) {
    const result = await db.from('communication_conversations').select('*').eq('id', input.conversation).maybeSingle();
    if (result.error || !result.data || (customer && customer !== result.data.customer_id) || (company && company !== result.data.company_id)) throw new Error('Conversation is unavailable.');
    direct = result.data;
    customer = direct.customer_id; company = direct.company_id;
  }
  if (!customer) return direct ? [direct] : [];
  const person = await db.from('customers').select('id,company_id').eq('id', customer).maybeSingle();
  if (person.error || !person.data?.company_id || (company && company !== person.data.company_id)) throw new Error('Customer conversation is unavailable.');
  company = person.data.company_id;
  const all: NonNullable<typeof direct>[] = [];
  for (let offset = 0; ; offset += 200) {
    let query = db.from('communication_conversations').select('*').eq('customer_id', customer).order('id').range(offset, offset + 199);
    if (company) query = query.eq('company_id', company);
    const page = await query;
    if (page.error) throw new Error('Customer conversation is unavailable.');
    all.push(...(page.data ?? []));
    if (!page.data || page.data.length < 200) break;
  }
  const companies = new Set(all.map(row => row.company_id));
  if (companies.size > 1 || (all.length && companies.has(null))) throw new Error('Customer company context is ambiguous.');
  // A conversation's linked Job must belong to the same canonical customer/company.
  const jobs = [...new Set(all.flatMap(row => row.service_request_id ? [row.service_request_id] : []))];
  for (let offset = 0; offset < jobs.length; offset += 200) {
    const ids = jobs.slice(offset, offset + 200);
    const result = await db.from('service_requests').select('id,customer_id,company_id').in('id', ids);
    if (result.error || result.data?.length !== ids.length || result.data.some(row => row.customer_id !== customer || !companies.has(row.company_id))) throw new Error('Customer Job context is unavailable.');
  }
  return all;
}

export function enterCustomerCommunications(win: Window, customerId: string, jobId: string | undefined, navigate: (href: string) => void, tab?: string) {
  const url = new URL(win.location.href);
  if (tab) url.searchParams.set('tab', tab);
  const origin = workspaceReturnTo(url.pathname + url.search);
  if (origin && origin !== win.location.pathname + win.location.search) win.history.replaceState(win.history.state, '', origin);
  const href = customerCommunicationsHref(customerId, jobId, origin ?? undefined);
  try {
    const destination = hubDestination(new URL(href, win.location.origin).search, {});
    const pending = JSON.parse(win.sessionStorage.getItem('wra-hub-entry') ?? 'null');
    if (pending?.href === destination && Date.now() - pending.at < 1000) return;
    win.sessionStorage.setItem('wra-hub-entry', JSON.stringify({ href: destination, origin, at: Date.now() }));
  } catch { /* Safe URL fallback remains available. */ }
  navigate(href);
}
export function claimHubOrigin(win: Window) {
  try {
    const entry = JSON.parse(win.sessionStorage.getItem('wra-hub-entry') ?? 'null');
    win.sessionStorage.removeItem('wra-hub-entry');
    const current = hubDestination(win.location.search, {});
    if (entry?.href === current && entry.origin === workspaceReturnTo(new URLSearchParams(win.location.search).get('returnTo'))) {
      win.history.replaceState({ ...win.history.state, wraHub: { url: current, depth: 0, hasList: false, origin: entry.origin } }, '', current);
    }
  } catch { /* Missing storage must not block navigation. */ }
}
