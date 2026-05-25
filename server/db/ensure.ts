import { db } from "./client";
import { sql } from "drizzle-orm";

export async function ensureInvoicesTableShape() {
  await db.execute(sql`
    alter table invoices
      add column if not exists last_reminder_sent_at timestamptz,
      add column if not exists reminder_count integer not null default 0
  `);

  await db.execute(sql`
    create table if not exists invoice_reminder_logs (
      id uuid primary key default gen_random_uuid(),
      invoice_id uuid not null references invoices(id) on delete cascade,
      org_id uuid not null,
      sent_at timestamptz not null default now(),
      recipient_email text not null,
      reminder_number integer not null,
      status text not null default 'sent'
    )
  `);
  await db.execute(sql`
    create index if not exists invoice_reminder_logs_invoice_idx
      on invoice_reminder_logs(invoice_id, sent_at desc)
  `);

  // On first deploy: stamp any already-overdue invoices so they don't all fire
  // immediately. Setting last_reminder_sent_at = now() - 4 days means the first
  // reminder will go out ~3 days from deploy, joining the normal 7-day cycle.
  await db.execute(sql`
    update invoices
    set last_reminder_sent_at = now() - interval '4 days'
    where status not in ('paid', 'void')
      and due_at is not null
      and due_at < now() - interval '3 days'
      and last_reminder_sent_at is null
  `);
}

export async function ensureUsersTableShape() {
  await db.execute(sql`
    alter table users
      add column if not exists email text,
      add column if not exists role text,
      add column if not exists org_id uuid,
      add column if not exists phone text,
      add column if not exists avatar_url text,
      add column if not exists avatar_seed text,
      add column if not exists avatar_variant text,
      add column if not exists created_at timestamptz default now()
  `);

  await db.execute(sql`
    create unique index if not exists users_org_email_unique
      on users (org_id, lower(email))
  `);
  await db.execute(sql`create index if not exists users_org_idx on users(org_id)`);
}