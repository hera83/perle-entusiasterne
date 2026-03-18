/**
 * Supabase-compatible client proxy for local/self-hosted mode.
 * 
 * Implements the subset of the Supabase JS client API that this app uses,
 * routing all calls to the local Express backend instead of Supabase.
 */

const API_URL = import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3001';

// ─── Auth Client ────────────────────────────────────────────────────────────

class LocalAuthClient {
  private token: string | null = null;
  private currentUser: any = null;
  private listeners = new Set<(event: string, session: any) => void>();

  constructor() {
    const stored = localStorage.getItem('local_auth_token');
    const storedUser = localStorage.getItem('local_auth_user');
    if (stored) this.token = stored;
    if (storedUser) try { this.currentUser = JSON.parse(storedUser); } catch { /* ignore */ }
  }

  getToken(): string | null { return this.token; }

  private buildSession() {
    if (!this.token || !this.currentUser) return null;
    return {
      access_token: this.token,
      refresh_token: '',
      token_type: 'bearer',
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: this.currentUser,
    };
  }

  private notify(event: string, session: any) {
    this.listeners.forEach(cb => { try { cb(event, session); } catch { /* ignore */ } });
  }

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch(`${API_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        return { data: { user: null, session: null }, error: new Error(json.error || 'Login failed') };
      }
      this.token = json.session.access_token;
      this.currentUser = json.user;
      localStorage.setItem('local_auth_token', this.token!);
      localStorage.setItem('local_auth_user', JSON.stringify(this.currentUser));
      const session = this.buildSession();
      this.notify('SIGNED_IN', session);
      return { data: { user: this.currentUser, session }, error: null };
    } catch (err: any) {
      return { data: { user: null, session: null }, error: new Error(err.message) };
    }
  }

  async signUp({ email, password, options }: any) {
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, data: options?.data }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        return { data: { user: null, session: null }, error: new Error(json.error || 'Signup failed') };
      }
      // Auto sign-in after signup
      this.token = json.session?.access_token || null;
      this.currentUser = json.user || null;
      if (this.token) {
        localStorage.setItem('local_auth_token', this.token);
        localStorage.setItem('local_auth_user', JSON.stringify(this.currentUser));
      }
      return { data: { user: json.user, session: json.session }, error: null };
    } catch (err: any) {
      return { data: { user: null, session: null }, error: new Error(err.message) };
    }
  }

  async signOut() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('local_auth_token');
    localStorage.removeItem('local_auth_user');
    this.notify('SIGNED_OUT', null);
    return { error: null };
  }

  async getSession() {
    return { data: { session: this.buildSession() }, error: null };
  }

  async getUser() {
    if (!this.currentUser) return { data: { user: null }, error: null };
    // Optionally re-validate token with backend
    return { data: { user: this.currentUser }, error: null };
  }

  async refreshSession() {
    // Local mode uses long-lived tokens; no refresh needed
    return { data: { session: this.buildSession() }, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    this.listeners.add(callback);
    // Fire INITIAL_SESSION asynchronously
    setTimeout(() => {
      callback('INITIAL_SESSION', this.buildSession());
    }, 0);
    return {
      data: {
        subscription: {
          unsubscribe: () => { this.listeners.delete(callback); },
        },
      },
    };
  }

  async stopAutoRefresh() { /* no-op */ }
}

// ─── Query Builder ──────────────────────────────────────────────────────────

class LocalQueryBuilder {
  private _table: string;
  private _op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private _selectCols?: string;
  private _returnCols?: string;
  private _filters: any[] = [];
  private _orderCols: any[] = [];
  private _rangeVal?: { from: number; to: number };
  private _body?: any;
  private _upsertOpts?: any;
  private _singleVal = false;
  private _maybeSingleVal = false;
  private _countVal?: string;
  private _headVal = false;
  private _auth: LocalAuthClient;

  constructor(table: string, auth: LocalAuthClient) {
    this._table = table;
    this._auth = auth;
  }

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    if (this._op === 'insert' || this._op === 'update' || this._op === 'upsert') {
      this._returnCols = columns;
    } else {
      this._op = 'select';
      this._selectCols = columns;
    }
    if (options?.count) this._countVal = options.count;
    if (options?.head) this._headVal = options.head;
    return this;
  }

  insert(body: any) { this._op = 'insert'; this._body = body; return this; }
  update(body: any) { this._op = 'update'; this._body = body; return this; }
  upsert(body: any, opts?: { onConflict?: string }) { this._op = 'upsert'; this._body = body; this._upsertOpts = opts; return this; }
  delete() { this._op = 'delete'; return this; }

  eq(col: string, val: any) { this._filters.push({ type: 'eq', column: col, value: val }); return this; }
  neq(col: string, val: any) { this._filters.push({ type: 'neq', column: col, value: val }); return this; }
  in(col: string, vals: any[]) { this._filters.push({ type: 'in', column: col, value: vals }); return this; }
  ilike(col: string, val: string) { this._filters.push({ type: 'ilike', column: col, value: val }); return this; }
  gte(col: string, val: any) { this._filters.push({ type: 'gte', column: col, value: val }); return this; }
  lte(col: string, val: any) { this._filters.push({ type: 'lte', column: col, value: val }); return this; }
  or(expr: string) { this._filters.push({ type: 'or', value: expr }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderCols.push({ column: col, ascending: opts?.ascending ?? true });
    return this;
  }

  range(from: number, to: number) { this._rangeVal = { from, to }; return this; }
  single() { this._singleVal = true; return this; }
  maybeSingle() { this._maybeSingleVal = true; return this; }

  // Make thenable so `await builder` works
  then(resolve: (value: any) => void, reject?: (reason: any) => void): Promise<any> {
    return this._execute().then(resolve, reject);
  }

  private async _execute(): Promise<any> {
    const token = this._auth.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const payload = {
      table: this._table,
      operation: this._op,
      select: this._selectCols,
      returnSelect: this._returnCols,
      filters: this._filters,
      order: this._orderCols,
      range: this._rangeVal,
      body: this._body,
      upsertOptions: this._upsertOpts,
      single: this._singleVal,
      maybeSingle: this._maybeSingleVal,
      count: this._countVal,
      head: this._headVal,
    };

    try {
      const res = await fetch(`${API_URL}/api/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }
}

// ─── Main Client ────────────────────────────────────────────────────────────

class LocalClient {
  auth: LocalAuthClient;
  functions: {
    invoke: (name: string, options: { body: any }) => Promise<any>;
  };

  constructor() {
    this.auth = new LocalAuthClient();
    this.functions = {
      invoke: async (name: string, options: { body: any }) => {
        const token = this.auth.getToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
          const res = await fetch(`${API_URL}/api/functions/${name}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(options.body),
          });
          const data = await res.json();
          if (!res.ok) return { data: null, error: new Error(data.error || 'Function failed') };
          return { data, error: null };
        } catch (err: any) {
          return { data: null, error: new Error(err.message) };
        }
      },
    };
  }

  from(table: string): any {
    return new LocalQueryBuilder(table, this.auth);
  }

  async rpc(name: string, args?: any): Promise<any> {
    const token = this.auth.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`${API_URL}/api/rpc/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(args || {}),
      });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json.error || 'RPC failed' } };
      return { data: json.result, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }
}

export const localClient = new LocalClient();
