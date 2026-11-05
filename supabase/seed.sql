-- =====================================================================
-- seed.sql : fictional sample data (branches, plans, coverage)
-- Safe to run once on a fresh project. Staff and customer accounts are
-- created by scripts/seed-demo.mjs because they need Supabase Auth users.
-- =====================================================================

insert into public.branches (name, address, city, province, contact_number, email)
values
  ('AON FIBER – Quezon City', '88 Cyber Avenue, Diliman', 'Quezon City', 'Metro Manila', '(02) 8555-0110', 'qc@aonfiber.example'),
  ('AON FIBER – Makati', '12 Fiber Lane, Poblacion', 'Makati City', 'Metro Manila', '(02) 8555-0111', 'makati@aonfiber.example'),
  ('AON FIBER – Cebu', '45 Horizon Street, Lahug', 'Cebu City', 'Cebu', '(032) 255-0110', 'cebu@aonfiber.example'),
  ('AON FIBER – Davao', '7 Speed Boulevard, Matina', 'Davao City', 'Davao del Sur', '(082) 285-0110', 'davao@aonfiber.example'),
  ('AON FIBER – Iloilo', '23 Gateway Road, Mandurriao', 'Iloilo City', 'Iloilo', '(033) 335-0110', 'iloilo@aonfiber.example'),
  ('AON FIBER – Baguio', '9 Summit Street, Session Road', 'Baguio City', 'Benguet', '(074) 445-0110', 'baguio@aonfiber.example')
on conflict do nothing;

insert into public.internet_plans (name, speed_mbps, monthly_price, description, features, sort_order)
values
  ('Fiber Start', 50, 899.00,
   'Reliable fiber for small households, browsing and streaming.',
   array['Up to 50 Mbps', 'Unlimited data', 'Free installation', '20 devices'], 1),
  ('Fiber Plus', 100, 1299.00,
   'The everyday family plan for multiple screens and work from home.',
   array['Up to 100 Mbps', 'Unlimited data', 'Free installation', 'Free Wi-Fi 6 router', '40 devices'], 2),
  ('Fiber Max', 300, 1899.00,
   'Fast fiber for gaming, 4K streaming and heavy households.',
   array['Up to 300 Mbps', 'Unlimited data', 'Free installation', 'Mesh-ready router', '70 devices'], 3),
  ('Fiber Pro', 500, 2499.00,
   'High-capacity fiber for creators and small businesses.',
   array['Up to 500 Mbps', 'Unlimited data', 'Priority support', 'Static IP option', '100 devices'], 4),
  ('Fiber Ultra', 1000, 3499.00,
   'Gigabit fiber with dedicated business support.',
   array['Up to 1 Gbps', 'Unlimited data', '24/7 priority support', 'Static IP option', '200 devices'], 5)
on conflict do nothing;

insert into public.branch_coverage (branch_id, city, barangay, area, is_serviceable, notes)
select b.id, v.city, v.barangay, v.area, v.is_serviceable, v.notes
from (
  values
    ('AON FIBER – Quezon City', 'Quezon City', 'Diliman', 'Sikatuna Village', true, 'Fiber ready'),
    ('AON FIBER – Quezon City', 'Quezon City', 'Diliman', 'UP Village', true, 'Fiber ready'),
    ('AON FIBER – Quezon City', 'Quezon City', 'Batasan Hills', null, true, 'Fiber ready'),
    ('AON FIBER – Quezon City', 'Quezon City', 'Commonwealth', null, false, 'Construction ongoing – target Q2'),
    ('AON FIBER – Makati', 'Makati City', 'Poblacion', null, true, 'Fiber ready'),
    ('AON FIBER – Makati', 'Makati City', 'Bel-Air', null, true, 'Fiber ready'),
    ('AON FIBER – Makati', 'Makati City', 'Guadalupe Nuevo', null, false, 'Pending node upgrade'),
    ('AON FIBER – Cebu', 'Cebu City', 'Lahug', 'IT Park', true, 'Fiber ready'),
    ('AON FIBER – Cebu', 'Cebu City', 'Banilad', null, true, 'Fiber ready'),
    ('AON FIBER – Cebu', 'Cebu City', 'Talamban', null, true, 'Fiber ready'),
    ('AON FIBER – Davao', 'Davao City', 'Matina', null, true, 'Fiber ready'),
    ('AON FIBER – Davao', 'Davao City', 'Buhangin', null, true, 'Fiber ready'),
    ('AON FIBER – Davao', 'Davao City', 'Toril', null, false, 'Survey scheduled'),
    ('AON FIBER – Iloilo', 'Iloilo City', 'Mandurriao', null, true, 'Fiber ready'),
    ('AON FIBER – Iloilo', 'Iloilo City', 'Jaro', null, true, 'Fiber ready'),
    ('AON FIBER – Baguio', 'Baguio City', 'Session Road Area', null, true, 'Fiber ready'),
    ('AON FIBER – Baguio', 'Baguio City', 'Loakan', null, false, 'Not yet covered')
) as v(branch_name, city, barangay, area, is_serviceable, notes)
join public.branches b on b.name = v.branch_name
on conflict do nothing;
