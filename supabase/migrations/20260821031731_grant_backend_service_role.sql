-- ============================================================================
-- KUCHI'S
-- Grant backend Data API access to service_role
-- ============================================================================

grant usage on schema public to service_role;

-- Catalog and internal configuration
grant select, insert, update
on table
  public.profiles,
  public.categories,
  public.products,
  public.service_points
to service_role;

-- Operational data
grant select, insert, update
on table
  public.shifts,
  public.shift_closures,
  public.service_sessions,
  public.orders,
  public.order_items,
  public.payments
to service_role;

-- Audit log is append-only from the application
grant select, insert
on table public.audit_logs
to service_role;