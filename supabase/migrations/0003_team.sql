-- Team: a chief, appointed admins, assigned work and a staff-only chat.
--
-- Roles:
--   chief     the address in ADMIN_EMAIL. Appoints and removes admins, blocks
--             accounts, assigns work. Exactly one, and it cannot be granted
--             from inside the app -- only by changing the environment variable.
--   admin     appointed by the chief. Runs the store and joins the chat, but
--             cannot manage people. This is the role a compromised admin
--             account is limited to.
--   customer  everyone else.
--
-- 'owner' stays in the check constraint so rows written before this migration
-- remain valid; identity() upgrades them to 'chief' on next sign-in.

alter table customers drop constraint if exists customers_role_check;
alter table customers add constraint customers_role_check
  check (role in ('customer', 'admin', 'chief', 'owner'));

-- Blocking is separate from role: a blocked admin is refused without losing
-- their appointment, so unblocking does not mean re-granting access by hand.
alter table customers add column if not exists blocked boolean not null default false;

create index if not exists idx_customers_role on customers (role);

-- ------------------------------------------------------------------- tasks

create table if not exists admin_tasks (
  id          text primary key,
  title       text not null,
  detail      text not null default '',
  assignee_id uuid references customers (id) on delete set null,
  created_by  uuid not null references customers (id),
  status      text not null default 'open' check (status in ('open', 'doing', 'done')),
  due_date    text not null default '',
  version     integer not null default 1,
  created_at  text not null,
  updated_at  text not null
);

create index if not exists idx_tasks_assignee on admin_tasks (assignee_id, status);
create index if not exists idx_tasks_created on admin_tasks (created_at desc);

-- ------------------------------------------------------------------- chat

create table if not exists admin_messages (
  id         text primary key,
  author_id  uuid not null references customers (id) on delete cascade,
  body       text not null,
  created_at text not null
);

create index if not exists idx_messages_created on admin_messages (created_at desc);

-- --------------------------------------------------------------------- RLS
-- Both tables are staff-only and reached exclusively through the Worker, which
-- connects as the table owner. No policies means no client key can read them,
-- which is the intent: the chat and the task list are internal.

alter table admin_tasks enable row level security;
alter table admin_messages enable row level security;
