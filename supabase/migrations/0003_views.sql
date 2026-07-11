create view public.v_user_first_day as
  select user_id, min(reviewed_at)::date as first_day
  from public.review_logs
  where counts_for_scheduling
  group by user_id;

create view public.v_return_rates as
  select d.offset_days,
         count(distinct l.user_id) as returned,
         (select count(*) from public.v_user_first_day) as cohort
  from (values (1),(3),(7)) as d(offset_days)
  cross join public.v_user_first_day f
  left join public.review_logs l
    on l.user_id = f.user_id
   and l.counts_for_scheduling
   and l.reviewed_at::date = f.first_day + d.offset_days
  group by d.offset_days
  order by d.offset_days;

create view public.v_reviews_per_user_day as
  select user_id, reviewed_at::date as day, count(*) as reviews
  from public.review_logs
  where counts_for_scheduling
  group by 1, 2
  order by 2, 1;

create view public.v_unit_completion as
  select u.slug,
         count(p.user_id) filter (where p.status = 'completed') as completed,
         count(p.user_id) as started
  from public.units u
  left join public.unit_progress p on p.unit_slug = u.slug
  group by u.slug;
