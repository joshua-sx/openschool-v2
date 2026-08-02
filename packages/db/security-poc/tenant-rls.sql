-- ISOLATED SECURITY PROOF ONLY - NEVER ADD THIS FILE TO THE MIGRATION JOURNAL.
-- The runner replaces the one-time password placeholder and refuses non-loopback hosts.

drop schema if exists security_poc cascade;
drop role if exists openschool_poc_login;
drop role if exists openschool_poc_app;
drop role if exists openschool_poc_owner;

create role openschool_poc_owner
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role openschool_poc_app
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role openschool_poc_login
  login password '__POC_PASSWORD__'
  nosuperuser nocreatedb nocreaterole inherit nobypassrls
  in role openschool_poc_app;

create schema security_poc authorization openschool_poc_owner;

set role openschool_poc_owner;

create table security_poc.student_records (
  id uuid primary key,
  tenant_id uuid not null,
  display_name text not null
);

insert into security_poc.student_records (id, tenant_id, display_name)
values
  ('00000000-0000-4000-8000-000000009101', '00000000-0000-4000-8000-000000009001', 'Tenant A student'),
  ('00000000-0000-4000-8000-000000009102', '00000000-0000-4000-8000-000000009002', 'Tenant B student');

create index student_records_tenant_id_idx
  on security_poc.student_records (tenant_id);

alter table security_poc.student_records enable row level security;
alter table security_poc.student_records force row level security;

create policy student_records_tenant_policy
  on security_poc.student_records
  for all
  to openschool_poc_app
  using (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  with check (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

reset role;

grant usage on schema security_poc to openschool_poc_app;
grant select, insert, update on security_poc.student_records to openschool_poc_app;
