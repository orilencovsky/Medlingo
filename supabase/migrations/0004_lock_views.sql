alter view public.v_user_first_day set (security_invoker = on);
alter view public.v_return_rates set (security_invoker = on);
alter view public.v_reviews_per_user_day set (security_invoker = on);
alter view public.v_unit_completion set (security_invoker = on);

revoke all on public.v_user_first_day, public.v_return_rates,
               public.v_reviews_per_user_day, public.v_unit_completion
  from anon, authenticated;
