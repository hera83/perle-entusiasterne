import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db';
import { authMiddleware, requireAuth, type AuthRequest } from './middleware/auth';
import { RELATIONSHIPS, PUBLIC_READ_TABLES, PUBLIC_INSERT_TABLES } from './schema';
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'local' });
});

// ─── Auth ───────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, data } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = randomUUID();
    const displayName = data?.display_name || email;

    // Check if email exists (also check soft-deleted)
    const existing = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    await pool.query(
      'INSERT INTO auth_users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [userId, email, hashedPassword, JSON.stringify({ display_name: displayName })]
    );

    // Create profile (mirrors handle_new_user trigger)
    await pool.query(
      'INSERT INTO profiles (user_id, display_name, email) VALUES ($1, $2, $3)',
      [userId, displayName, email]
    );

    // Auto-assign admin role to the first user
    const userCount = await pool.query('SELECT COUNT(*) as cnt FROM profiles');
    if (parseInt(userCount.rows[0].cnt) === 1) {
      await pool.query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING",
        [userId]
      );
    }

    const token = jwt.sign({ sub: userId, email, role: 'authenticated' }, JWT_SECRET, { expiresIn: JWT_EXPIRY as any });
    const user = { id: userId, email, user_metadata: { display_name: displayName } };
    const session = { access_token: token, token_type: 'bearer', expires_in: 86400, user };

    res.json({ user, session });
  } catch (err: any) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT id, email, encrypted_password, raw_user_meta_data, last_sign_in_at FROM auth_users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid login credentials' });

    const dbUser = result.rows[0];
    const valid = await bcrypt.compare(password, dbUser.encrypted_password);
    if (!valid) return res.status(401).json({ error: 'Invalid login credentials' });

    // Update last sign in
    await pool.query('UPDATE auth_users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = $1', [dbUser.id]);

    const token = jwt.sign({ sub: dbUser.id, email: dbUser.email, role: 'authenticated' }, JWT_SECRET, { expiresIn: JWT_EXPIRY as any });
    const metadata = dbUser.raw_user_meta_data || {};
    const user = { id: dbUser.id, email: dbUser.email, user_metadata: metadata };
    const session = { access_token: token, token_type: 'bearer', expires_in: 86400, user };

    res.json({ user, session });
  } catch (err: any) {
    console.error('Signin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Generic Query Handler ──────────────────────────────────────────────────

app.post('/api/query', authMiddleware, async (req: AuthRequest, res) => {
  const { table, operation, select, returnSelect, filters, order, range, body, upsertOptions, single, maybeSingle, count, head } = req.body;
  const userId = (req as any).userId;

  try {
    let result: any;

    switch (operation) {
      case 'select':
        result = await handleSelect(table, select, filters, order, range, single, maybeSingle, count, head);
        break;
      case 'insert':
        result = await handleInsert(table, body, returnSelect, userId);
        break;
      case 'update':
        result = await handleUpdate(table, body, filters, returnSelect);
        break;
      case 'upsert':
        result = await handleUpsert(table, body, upsertOptions, returnSelect);
        break;
      case 'delete':
        result = await handleDelete(table, filters);
        break;
      default:
        return res.status(400).json({ data: null, error: { message: `Unknown operation: ${operation}` } });
    }

    res.json(result);
  } catch (err: any) {
    console.error('Query error:', err);
    res.json({ data: null, error: { message: err.message }, count: null });
  }
});

// ─── Select Handler ─────────────────────────────────────────────────────────

async function handleSelect(
  table: string, selectCols: string | undefined, filters: any[], order: any[], rangeVal: any,
  single: boolean, maybeSingle: boolean, countMode: string | undefined, headMode: boolean
) {
  // Parse embedded relations from select string (e.g., "categories(name)")
  const { columns, joins } = parseSelectWithJoins(table, selectCols);

  let sql = `SELECT ${columns}`;
  sql += ` FROM ${table}`;

  // Add joins
  for (const join of joins) {
    sql += ` LEFT JOIN ${join.table} ON ${join.on}`;
  }

  const { whereClause, values } = buildWhere(filters);
  if (whereClause) sql += ` WHERE ${whereClause}`;

  // Order
  if (order && order.length > 0) {
    const orderParts = order.map((o: any) => `${table}.${o.column} ${o.ascending ? 'ASC' : 'DESC'}`);
    sql += ` ORDER BY ${orderParts.join(', ')}`;
  }

  // Range (pagination)
  if (rangeVal) {
    const limit = rangeVal.to - rangeVal.from + 1;
    sql += ` LIMIT ${limit} OFFSET ${rangeVal.from}`;
  }

  // Count query
  let totalCount: number | null = null;
  if (countMode === 'exact') {
    const countSql = `SELECT COUNT(*) as cnt FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;
    const countResult = await pool.query(countSql, values);
    totalCount = parseInt(countResult.rows[0].cnt);
  }

  if (headMode) {
    return { data: null, error: null, count: totalCount };
  }

  const result = await pool.query(sql, values);

  // Post-process joins into nested objects
  const data = processJoinResults(result.rows, joins);

  if (single) {
    if (data.length === 0) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    return { data: data[0], error: null, count: totalCount };
  }
  if (maybeSingle) {
    return { data: data.length > 0 ? data[0] : null, error: null, count: totalCount };
  }

  return { data, error: null, count: totalCount };
}

// ─── Parse Select with Join Support ─────────────────────────────────────────

function parseSelectWithJoins(table: string, selectCols?: string) {
  if (!selectCols) return { columns: `${table}.*`, joins: [] as any[] };

  const joins: any[] = [];
  const columnParts: string[] = [];

  // Match patterns like "categories(name)" or "profiles(display_name)"
  const parts = selectCols.split(',').map(s => s.trim());

  for (const part of parts) {
    const joinMatch = part.match(/^(\w+)\(([^)]+)\)$/);
    if (joinMatch) {
      const relatedTable = joinMatch[1];
      const relatedCols = joinMatch[2].split(',').map((c: string) => c.trim());

      // Look up the relationship in schema
      const tableRels = RELATIONSHIPS[table];
      const forwardRel = tableRels?.forward?.[relatedTable];
      const reverseRel = tableRels?.reverse?.[relatedTable];
      const rel = forwardRel
        ? { fromColumn: forwardRel.fkColumn, toColumn: forwardRel.pkColumn }
        : reverseRel
        ? { fromColumn: reverseRel.pkColumn, toColumn: reverseRel.fkColumn }
        : null;
      if (rel) {
        joins.push({
          table: relatedTable,
          on: `${table}.${rel.fromColumn} = ${relatedTable}.${rel.toColumn}`,
          alias: relatedTable,
          columns: relatedCols,
        });
        // Add aliased columns
        for (const col of relatedCols) {
          columnParts.push(`${relatedTable}.${col} AS "${relatedTable}.${col}"`);
        }
      }
    } else if (part === '*') {
      columnParts.push(`${table}.*`);
    } else {
      columnParts.push(`${table}.${part}`);
    }
  }

  return { columns: columnParts.join(', '), joins };
}

function processJoinResults(rows: any[], joins: any[]) {
  if (joins.length === 0) return rows;

  return rows.map(row => {
    const result: any = {};

    for (const key of Object.keys(row)) {
      // Check if this is a joined column
      let isJoinCol = false;
      for (const join of joins) {
        for (const col of join.columns) {
          const aliasKey = `${join.table}.${col}`;
          if (key === aliasKey) {
            if (!result[join.table]) result[join.table] = {};
            result[join.table][col] = row[key];
            isJoinCol = true;
          }
        }
      }
      if (!isJoinCol) {
        result[key] = row[key];
      }
    }

    // Set null for joins with no match
    for (const join of joins) {
      if (result[join.table] && Object.values(result[join.table]).every((v: any) => v === null)) {
        result[join.table] = null;
      }
    }

    return result;
  });
}

// ─── Insert/Update/Delete Handlers ──────────────────────────────────────────

async function handleInsert(table: string, body: any, returnSelect?: string, _userId?: string) {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return { data: null, error: null };

  const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const valueSets: string[] = [];
  const allValues: any[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const key of allKeys) {
      const val = row[key];
      if (val !== undefined && val !== null && typeof val === 'object' && !Array.isArray(val)) {
        placeholders.push(`$${paramIdx++}`);
        allValues.push(JSON.stringify(val));
      } else if (Array.isArray(val)) {
        placeholders.push(`$${paramIdx++}`);
        allValues.push(JSON.stringify(val));
      } else {
        placeholders.push(`$${paramIdx++}`);
        allValues.push(val ?? null);
      }
    }
    valueSets.push(`(${placeholders.join(', ')})`);
  }

  let sql = `INSERT INTO ${table} (${allKeys.join(', ')}) VALUES ${valueSets.join(', ')}`;
  if (returnSelect) {
    sql += ` RETURNING ${returnSelect === '*' ? '*' : returnSelect}`;
  } else {
    sql += ` RETURNING *`;
  }

  const result = await pool.query(sql, allValues);
  const data = Array.isArray(body) ? result.rows : result.rows[0] || null;
  return { data, error: null };
}

async function handleUpdate(table: string, body: any, filters: any[], returnSelect?: string) {
  const keys = Object.keys(body);
  if (keys.length === 0) return { data: null, error: null };

  const setParts: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const key of keys) {
    const val = body[key];
    if (val !== undefined && val !== null && typeof val === 'object' && !Array.isArray(val)) {
      setParts.push(`${key} = $${paramIdx++}`);
      values.push(JSON.stringify(val));
    } else if (Array.isArray(val)) {
      setParts.push(`${key} = $${paramIdx++}`);
      values.push(JSON.stringify(val));
    } else {
      setParts.push(`${key} = $${paramIdx++}`);
      values.push(val);
    }
  }

  let sql = `UPDATE ${table} SET ${setParts.join(', ')}`;

  const { whereClause, values: filterValues } = buildWhere(filters, paramIdx);
  values.push(...filterValues);
  if (whereClause) sql += ` WHERE ${whereClause}`;

  if (returnSelect) {
    sql += ` RETURNING ${returnSelect === '*' ? '*' : returnSelect}`;
  }

  const result = await pool.query(sql, values);
  return { data: returnSelect ? result.rows : null, error: null };
}

async function handleUpsert(table: string, body: any, opts: any, returnSelect?: string) {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return { data: null, error: null };

  const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const valueSets: string[] = [];
  const allValues: any[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const key of allKeys) {
      const val = row[key];
      if (val !== undefined && val !== null && typeof val === 'object') {
        placeholders.push(`$${paramIdx++}`);
        allValues.push(JSON.stringify(val));
      } else {
        placeholders.push(`$${paramIdx++}`);
        allValues.push(val ?? null);
      }
    }
    valueSets.push(`(${placeholders.join(', ')})`);
  }

  const conflictTarget = opts?.onConflict || 'id';
  const updateCols = allKeys.filter(k => k !== conflictTarget && !conflictTarget.split(',').map((c: string) => c.trim()).includes(k));
  const updateSet = updateCols.map(k => `${k} = EXCLUDED.${k}`).join(', ');

  let sql = `INSERT INTO ${table} (${allKeys.join(', ')}) VALUES ${valueSets.join(', ')}`;
  sql += ` ON CONFLICT (${conflictTarget}) DO ${updateSet ? `UPDATE SET ${updateSet}` : 'NOTHING'}`;
  sql += ` RETURNING *`;

  const result = await pool.query(sql, allValues);
  return { data: result.rows, error: null };
}

async function handleDelete(table: string, filters: any[]) {
  const { whereClause, values } = buildWhere(filters);
  let sql = `DELETE FROM ${table}`;
  if (whereClause) sql += ` WHERE ${whereClause}`;
  await pool.query(sql, values);
  return { data: null, error: null };
}

// ─── Where Clause Builder ───────────────────────────────────────────────────

function buildWhere(filters: any[], startIdx = 1): { whereClause: string; values: any[] } {
  if (!filters || filters.length === 0) return { whereClause: '', values: [] };

  const parts: string[] = [];
  const values: any[] = [];
  let paramIdx = startIdx;

  for (const f of filters) {
    switch (f.type) {
      case 'eq':
        parts.push(`${f.column} = $${paramIdx++}`);
        values.push(f.value);
        break;
      case 'neq':
        parts.push(`${f.column} != $${paramIdx++}`);
        values.push(f.value);
        break;
      case 'in':
        if (Array.isArray(f.value) && f.value.length > 0) {
          const placeholders = f.value.map(() => `$${paramIdx++}`).join(', ');
          parts.push(`${f.column} IN (${placeholders})`);
          values.push(...f.value);
        }
        break;
      case 'ilike':
        parts.push(`${f.column} ILIKE $${paramIdx++}`);
        values.push(f.value);
        break;
      case 'gte':
        parts.push(`${f.column} >= $${paramIdx++}`);
        values.push(f.value);
        break;
      case 'lte':
        parts.push(`${f.column} <= $${paramIdx++}`);
        values.push(f.value);
        break;
      case 'or': {
        // Parse simple Supabase OR expressions like "is_public.eq.true,user_id.eq.xxx"
        const orParts = parseOrExpression(f.value, paramIdx);
        if (orParts.clause) {
          parts.push(`(${orParts.clause})`);
          values.push(...orParts.values);
          paramIdx = orParts.nextIdx;
        }
        break;
      }
    }
  }

  return { whereClause: parts.join(' AND '), values };
}

function parseOrExpression(expr: string, startIdx: number): { clause: string; values: any[]; nextIdx: number } {
  const conditions = expr.split(',');
  const parts: string[] = [];
  const values: any[] = [];
  let idx = startIdx;

  for (const cond of conditions) {
    const match = cond.trim().match(/^(\w+)\.(eq|neq|gt|gte|lt|lte|ilike)\.(.+)$/);
    if (match) {
      const [, col, op, rawVal] = match;
      const val = rawVal === 'true' ? true : rawVal === 'false' ? false : rawVal;
      const sqlOp = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', ilike: 'ILIKE' }[op] || '=';
      parts.push(`${col} ${sqlOp} $${idx++}`);
      values.push(val);
    }
  }

  return { clause: parts.join(' OR '), values, nextIdx: idx };
}

// ─── RPC Endpoints ──────────────────────────────────────────────────────────

app.post('/api/rpc/:name', authMiddleware, async (req: AuthRequest, res) => {
  const { name } = req.params;
  const userId = (req as any).userId;

  try {
    switch (name) {
      case 'has_any_users': {
        const result = await pool.query('SELECT EXISTS (SELECT 1 FROM profiles) as exists');
        return res.json({ result: result.rows[0].exists });
      }
      case 'has_role': {
        const { _user_id, _role } = req.body;
        const result = await pool.query('SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2) as exists', [_user_id, _role]);
        return res.json({ result: result.rows[0].exists });
      }
      case 'is_admin': {
        const { _user_id } = req.body;
        const result = await pool.query("SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin') as exists", [_user_id]);
        return res.json({ result: result.rows[0].exists });
      }
      case 'get_admin_stats': {
        if (!userId) return res.status(401).json({ error: 'Not authorized' });
        const isAdmin = await pool.query("SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin') as is_admin", [userId]);
        if (!isAdmin.rows[0].is_admin) return res.status(403).json({ error: 'Not authorized' });

        const stats = await pool.query(`
          SELECT json_build_object(
            'total_patterns', (SELECT count(*) FROM bead_patterns),
            'public_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = true),
            'private_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = false),
            'total_categories', (SELECT count(*) FROM categories),
            'total_users', (SELECT count(*) FROM profiles),
            'started_patterns', (SELECT count(*) FROM user_progress),
            'total_downloads', (SELECT count(*) FROM pdf_downloads)
          ) as stats
        `);
        return res.json({ result: stats.rows[0].stats });
      }
      case 'owns_pattern': {
        const { _user_id, _pattern_id } = req.body;
        const result = await pool.query('SELECT EXISTS (SELECT 1 FROM bead_patterns WHERE id = $1 AND user_id = $2) as exists', [_pattern_id, _user_id]);
        return res.json({ result: result.rows[0].exists });
      }
      case 'get_pattern_owner': {
        const { _pattern_id } = req.body;
        const result = await pool.query('SELECT user_id FROM bead_patterns WHERE id = $1', [_pattern_id]);
        return res.json({ result: result.rows[0]?.user_id || null });
      }
      default:
        return res.status(404).json({ error: `Unknown RPC function: ${name}` });
    }
  } catch (err: any) {
    console.error('RPC error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Edge Function Equivalents ──────────────────────────────────────────────

app.post('/api/functions/admin-manage-user', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  const userId = (req as any).userId;

  // Verify admin
  const adminCheck = await pool.query("SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin') as is_admin", [userId]);
  if (!adminCheck.rows[0].is_admin) return res.status(403).json({ error: 'Kun administratorer har adgang' });

  const { action, userId: targetUserId, email, displayName, role, newPassword } = req.body;

  try {
    switch (action) {
      case 'list-users': {
        const users = await pool.query('SELECT id, email, last_sign_in_at FROM auth_users');
        const userMap: Record<string, any> = {};
        for (const u of users.rows) {
          userMap[u.id] = { last_sign_in_at: u.last_sign_in_at, email: u.email };
        }
        return res.json({ users: userMap });
      }

      case 'update-user': {
        if (!targetUserId) return res.status(400).json({ error: 'userId er påkrævet' });
        if (email) {
          await pool.query('UPDATE auth_users SET email = $1, updated_at = NOW() WHERE id = $2', [email, targetUserId]);
          await pool.query('UPDATE profiles SET email = $1 WHERE user_id = $2', [email, targetUserId]);
        }
        if (displayName !== undefined) {
          await pool.query('UPDATE profiles SET display_name = $1 WHERE user_id = $2', [displayName, targetUserId]);
          await pool.query("UPDATE auth_users SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}')::jsonb, '{display_name}', $1::jsonb) WHERE id = $2", [JSON.stringify(displayName), targetUserId]);
        }
        if (role) {
          await pool.query(`
            INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
            ON CONFLICT (user_id, role) DO UPDATE SET role = $2
          `, [targetUserId, role]);
          // Remove other roles
          await pool.query('DELETE FROM user_roles WHERE user_id = $1 AND role != $2', [targetUserId, role]);
        }
        return res.json({ success: true });
      }

      case 'reset-password': {
        if (!targetUserId || !newPassword) return res.status(400).json({ error: 'userId og newPassword er påkrævet' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'Adgangskoden skal være mindst 6 tegn' });
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE auth_users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2', [hash, targetUserId]);
        return res.json({ success: true });
      }

      case 'delete-user': {
        if (!targetUserId) return res.status(400).json({ error: 'userId er påkrævet' });
        const patternCount = await pool.query('SELECT COUNT(*) as cnt FROM bead_patterns WHERE user_id = $1', [targetUserId]);
        const count = parseInt(patternCount.rows[0].cnt);

        if (count === 0) {
          // Hard delete
          await pool.query('DELETE FROM user_favorites WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM user_progress WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM user_roles WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM profiles WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM auth_users WHERE id = $1', [targetUserId]);
        } else {
          // Soft delete
          const authUser = await pool.query('SELECT email FROM auth_users WHERE id = $1', [targetUserId]);
          const userEmail = authUser.rows[0]?.email || null;
          await pool.query('UPDATE profiles SET is_deleted = true, is_banned = true, email = $1 WHERE user_id = $2', [userEmail, targetUserId]);
          await pool.query('DELETE FROM user_roles WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM user_favorites WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM user_progress WHERE user_id = $1', [targetUserId]);
          await pool.query('DELETE FROM auth_users WHERE id = $1', [targetUserId]);
        }
        return res.json({ success: true });
      }

      case 'ban-user': {
        if (!targetUserId) return res.status(400).json({ error: 'userId er påkrævet' });
        const targetRole = await pool.query("SELECT role FROM user_roles WHERE user_id = $1 AND role = 'admin'", [targetUserId]);
        if (targetRole.rows.length > 0) return res.status(400).json({ error: 'Administratorer kan ikke spærres' });
        await pool.query('UPDATE profiles SET is_banned = true WHERE user_id = $1', [targetUserId]);
        return res.json({ success: true });
      }

      case 'unban-user': {
        if (!targetUserId) return res.status(400).json({ error: 'userId er påkrævet' });
        await pool.query('UPDATE profiles SET is_banned = false WHERE user_id = $1', [targetUserId]);
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Ukendt action: ${action}` });
    }
  } catch (err: any) {
    console.error('Admin manage user error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/functions/create-user', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  const callerId = (req as any).userId;

  // Verify admin
  const adminCheck = await pool.query("SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin') as is_admin", [callerId]);
  if (!adminCheck.rows[0].is_admin) return res.status(403).json({ error: 'Kun administratorer kan oprette brugere' });

  const { email, password, displayName, role } = req.body;
  if (!email || !password || !displayName) return res.status(400).json({ error: 'Email, adgangskode og navn er påkrævet' });

  try {
    // Check for soft-deleted profile
    const deleted = await pool.query("SELECT id, user_id FROM profiles WHERE email = $1 AND is_deleted = true", [email]);

    if (deleted.rows.length > 0) {
      // Reactivation
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUserId = randomUUID();
      const oldUserId = deleted.rows[0].user_id;

      await pool.query(
        'INSERT INTO auth_users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [newUserId, email, hashedPassword, JSON.stringify({ display_name: displayName })]
      );

      // Transfer data
      await pool.query('UPDATE bead_patterns SET user_id = $1 WHERE user_id = $2', [newUserId, oldUserId]);
      await pool.query('UPDATE user_favorites SET user_id = $1 WHERE user_id = $2', [newUserId, oldUserId]);
      await pool.query('UPDATE user_progress SET user_id = $1 WHERE user_id = $2', [newUserId, oldUserId]);
      await pool.query('UPDATE profiles SET user_id = $1, display_name = $2, email = $3, is_deleted = false, is_banned = false WHERE id = $4',
        [newUserId, displayName, email, deleted.rows[0].id]);

      if (role) {
        await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [newUserId, role]);
      }

      return res.json({ success: true, userId: newUserId, reactivated: true });
    }

    // Normal creation
    const existing = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Denne email er allerede i brug' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserId = randomUUID();

    await pool.query(
      'INSERT INTO auth_users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [newUserId, email, hashedPassword, JSON.stringify({ display_name: displayName })]
    );

    // Profile is created, update it
    await pool.query('UPDATE profiles SET display_name = $1, email = $2 WHERE user_id = $3', [displayName, email, newUserId]);
    // If profile doesn't exist yet, create it
    await pool.query(
      'INSERT INTO profiles (user_id, display_name, email) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET display_name = $2, email = $3',
      [newUserId, displayName, email]
    );

    if (role) {
      await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [newUserId, role]);
    }

    return res.json({ success: true, userId: newUserId });
  } catch (err: any) {
    console.error('Create user error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/functions/generate-share-token', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  const { pattern_id } = req.body;
  if (!pattern_id) return res.status(400).json({ error: 'pattern_id is required' });

  try {
    const pattern = await pool.query('SELECT id, share_token FROM bead_patterns WHERE id = $1', [pattern_id]);
    if (pattern.rows.length === 0) return res.status(404).json({ error: 'Pattern not found' });

    if (pattern.rows[0].share_token) {
      return res.json({ share_token: pattern.rows[0].share_token });
    }

    const newToken = randomUUID();
    await pool.query('UPDATE bead_patterns SET share_token = $1 WHERE id = $2', [newToken, pattern_id]);
    return res.json({ share_token: newToken });
  } catch (err: any) {
    console.error('Generate share token error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/functions/get-shared-pattern', async (req, res) => {
  const shareToken = req.query.share_token as string;
  if (!shareToken) return res.status(400).json({ error: 'share_token parameter is required' });

  try {
    const pattern = await pool.query(`
      SELECT bp.id, bp.title, bp.category_id, bp.plate_width, bp.plate_height, bp.plate_dimension,
             bp.total_beads, bp.thumbnail, bp.user_id,
             c.name as category_name,
             p.display_name
      FROM bead_patterns bp
      LEFT JOIN categories c ON bp.category_id = c.id
      LEFT JOIN profiles p ON bp.user_id = p.user_id
      WHERE bp.share_token = $1
    `, [shareToken]);

    if (pattern.rows.length === 0) return res.status(404).json({ error: 'Pattern not found' });

    const pat = pattern.rows[0];
    const firstName = (pat.display_name || 'Ukendt').split(' ')[0];

    const plates = await pool.query(
      'SELECT row_index, column_index, beads FROM bead_plates WHERE pattern_id = $1 ORDER BY row_index, column_index',
      [pat.id]
    );

    const colors = await pool.query('SELECT id, hex_color, name, code FROM bead_colors ORDER BY code');

    res.json({
      pattern: {
        id: pat.id,
        title: pat.title,
        category_name: pat.category_name,
        creator_name: firstName,
        plate_width: pat.plate_width,
        plate_height: pat.plate_height,
        plate_dimension: pat.plate_dimension,
        total_beads: pat.total_beads,
        thumbnail: pat.thumbnail,
      },
      plates: plates.rows,
      colors: colors.rows,
    });
  } catch (err: any) {
    console.error('Get shared pattern error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Also support POST for get-shared-pattern (the frontend calls it via functions.invoke)
app.post('/api/functions/get-shared-pattern', async (req, res) => {
  // Redirect to GET handler
  const shareToken = req.body.share_token;
  req.query.share_token = shareToken;
  // Manually call the GET handler logic
  if (!shareToken) return res.status(400).json({ error: 'share_token parameter is required' });

  try {
    const pattern = await pool.query(`
      SELECT bp.id, bp.title, bp.category_id, bp.plate_width, bp.plate_height, bp.plate_dimension,
             bp.total_beads, bp.thumbnail, bp.user_id,
             c.name as category_name,
             p.display_name
      FROM bead_patterns bp
      LEFT JOIN categories c ON bp.category_id = c.id
      LEFT JOIN profiles p ON bp.user_id = p.user_id
      WHERE bp.share_token = $1
    `, [shareToken]);

    if (pattern.rows.length === 0) return res.status(404).json({ error: 'Pattern not found' });
    const pat = pattern.rows[0];
    const firstName = (pat.display_name || 'Ukendt').split(' ')[0];

    const plates = await pool.query('SELECT row_index, column_index, beads FROM bead_plates WHERE pattern_id = $1 ORDER BY row_index, column_index', [pat.id]);
    const colors = await pool.query('SELECT id, hex_color, name, code FROM bead_colors ORDER BY code');

    res.json({
      pattern: { id: pat.id, title: pat.title, category_name: pat.category_name, creator_name: firstName, plate_width: pat.plate_width, plate_height: pat.plate_height, plate_dimension: pat.plate_dimension, total_beads: pat.total_beads, thumbnail: pat.thumbnail },
      plates: plates.rows,
      colors: colors.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Local backend running on port ${PORT}`);
});
