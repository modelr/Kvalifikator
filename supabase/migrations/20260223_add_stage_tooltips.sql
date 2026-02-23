alter table public.leads
  add column if not exists waiting_tooltip text,
  add column if not exists estimating_tooltip text;
