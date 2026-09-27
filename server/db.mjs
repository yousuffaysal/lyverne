// Postgres behind the D1 interface that server/worker.mjs already speaks.
//
// The Worker calls db.prepare(sql).bind(...args).first() / .all() / .run(), and
// db.batch([...]) for atomic groups. Reimplementing that surface over Postgres
// keeps every transaction, version guard and stock check in worker.mjs exactly
// as written and tested, instead of rewriting them against a new client.
//
// Connect through Supabase's Supavisor transaction pooler (port 6543), not the
// direct 5432 connection: Workers open many short-lived connections and would
// exhaust Postgres' connection limit otherwise.

import postgres from 'postgres';

// D1 uses ? placeholders, Postgres uses $1..$n. Rewrite outside string literals
// so a ? inside quoted text is never mistaken for a parameter.
export function toPositional(sql) {
  let out = '';
  let n = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      // '' and "" are escaped quotes inside a literal, not the end of one.
      if (ch === quote && sql[i + 1] === quote) { out += ch + ch; i++; continue; }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    out += ch === '?' ? '$' + ++n : ch;
  }
  return out;
}

const runResult = rows => ({ success: true, meta: { changes: rows.count ?? rows.length ?? 0 } });

// Supavisor recycles pooled connections, and a query issued on one that has
// just been closed fails with a socket error rather than a database error.
const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED']);
const isTransient = error => TRANSIENT.has(error?.code) || TRANSIENT.has(error?.errno);

// Retries only reads. A write that failed mid-flight may or may not have been
// applied, so replaying it could duplicate an order or double-decrement stock;
// those surface as an error the caller reports instead.
async function retryRead(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!isTransient(error)) throw error;
    return fn();
  }
}

function statement(exec, sql, args) {
  return {
    sql,
    args,
    bind: (...values) => statement(exec, sql, values),
    async first() { return (await retryRead(() => exec(sql, args)))[0] ?? null; },
    async all() { return { results: [...(await retryRead(() => exec(sql, args)))] }; },
    async run() { return runResult(await exec(sql, args)); },
  };
}

export function createDatabase(connectionString, options = {}) {
  // Supavisor (and any NAT in between) drops idle connections without always
  // sending a FIN, which leaves a half-open socket. A query issued on one of
  // those never returns and never errors, so the request hangs until the client
  // gives up -- observed as every admin request timing out after a quiet spell.
  // These four settings make a dead peer detectable rather than silent:
  //   keep_alive   TCP probes surface a vanished peer instead of waiting
  //   max_lifetime connections are recycled before the pooler expires them
  //   idle_timeout idle sockets are closed by us first
  //   statement_timeout a server-side ceiling once a query does arrive
  const sql = postgres(connectionString, {
    max: options.max ?? 1,
    idle_timeout: 15,
    max_lifetime: 60 * 10,
    connect_timeout: 10,
    keep_alive: 30,
    prepare: false, // required by Supavisor in transaction mode
    connection: {statement_timeout: 15000, ...(options.connection || {})},
    ...options,
  });

  // postgres.js defaults to the simple protocol when there are no bind args,
  // which allows multiple statements in one string. Every query here is a
  // literal today, but pinning simple:false means a future caller that builds
  // SQL by concatenation gets a syntax error rather than statement chaining.
  // A wedged socket is the failure mode that hurts most: postgres.js keeps
  // waiting on a connection the pooler has already abandoned, the query never
  // reaches Postgres (so statement_timeout cannot fire), and with a small pool
  // every later request queues behind it until the whole site stops answering.
  // Bounding each query client-side turns that into a fast, retryable error.
  const queryTimeout = options.queryTimeout ?? 15000;
  const withDeadline = promise => {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('The database did not respond in time.');
          error.code = 'ETIMEDOUT';
          reject(error);
        }, queryTimeout);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  const exec = (text, args) => withDeadline(sql.unsafe(toPositional(text), args, {simple: false}));

  return {
    prepare: text => statement(exec, text, []),
    // One transaction, so a failed guard rolls the whole group back — matching
    // D1 batch semantics that worker.mjs relies on for order creation.
    async batch(statements) {
      return sql.begin(async tx => {
        const results = [];
        for (const s of statements) {
          results.push(runResult(await tx.unsafe(toPositional(s.sql), s.args, {simple: false})));
        }
        return results;
      });
    },
    // A transaction whose body can inspect each statement's row count and throw
    // to roll back. batch() cannot express that: it resolves only after COMMIT,
    // so a guard checked on its results has already been made durable.
    //
    // This matters because Postgres runs at READ COMMITTED here. A guard
    // written as a non-locking subquery -- "(SELECT COUNT(*) ... WHERE
    // stock>=?)=1" -- is evaluated against each transaction's own snapshot, so
    // two concurrent orders for the last unit both see it satisfied and both
    // proceed. Guards must therefore live in the WHERE clause of the UPDATE
    // that does the work, where row locks serialise them, and be verified by
    // that statement's own row count.
    async transaction(fn) {
      return sql.begin(async tx => fn({
        async run(text, ...args) { return runResult(await tx.unsafe(toPositional(text), args, {simple: false})); },
        async first(text, ...args) { return (await tx.unsafe(toPositional(text), args, {simple: false}))[0] ?? null; },
      }));
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
