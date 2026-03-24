-- Backup seed for Baja Etapa 1
-- Run in Supabase SQL editor

begin;

insert into trip_participants (trip_slug, name, emoji) values
  ('baja-etapa-1', 'Beto', '🏍️'),
  ('baja-etapa-1', 'Memo', '🏍️'),
  ('baja-etapa-1', 'Cuate', '🏍️')
on conflict do nothing;

delete from expense_splits where expense_id in (select id from trip_expenses where trip_slug = 'baja-etapa-1');
delete from trip_expenses where trip_slug = 'baja-etapa-1';

with participant_ids as (
  select id, name from trip_participants where trip_slug = 'baja-etapa-1'
),
expenses_seed (seed_idx, concept, category, amount, currency, exchange_rate, base_currency, base_amount, payer_name, expense_date, notes, split_names) as (
  values
    (1, 'Ferry', 'Transporte', 24100.00, 'MXN', 1.0000, 'MXN', 24100.00, 'Memo', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (2, 'Boletos avión', 'Transporte', 852.60, 'USD', 18.0000, 'MXN', 15346.80, 'Beto', '2026-02-24', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (3, 'Hotel Torreón', 'Hospedaje', 264.58, 'USD', 18.0000, 'MXN', 4762.44, 'Beto', '2026-02-16', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (4, 'Uber a Mochomos', 'Transporte', 150.00, 'MXN', 1.0000, 'MXN', 150.00, 'Memo', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (5, 'Mochomos', 'Comidas', 3716.80, 'MXN', 1.0000, 'MXN', 3716.80, 'Cuate', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (6, 'Sid Marina Beach', 'Hospedaje', 6855.00, 'MXN', 1.0000, 'MXN', 6855.00, 'Cuate', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (7, 'Uber a hotel', 'Transporte', 120.00, 'MXN', 1.0000, 'MXN', 120.00, 'Memo', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (8, 'Resort Fee', 'Hospedaje', 250.00, 'MXN', 1.0000, 'MXN', 250.00, 'Beto', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (9, 'Antojitos manantiales', 'Comidas', 220.00, 'MXN', 1.0000, 'MXN', 220.00, 'Cuate', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (10, 'Cerveza oxxo', 'Comidas', 220.00, 'MXN', 1.0000, 'MXN', 220.00, 'Cuate', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (11, 'Pulmonia', 'Transporte', 1500.00, 'MXN', 1.0000, 'MXN', 1500.00, 'Cuate', '2026-02-17', 'Taxi local en Mazatlán', string_to_array('Beto|Memo|Cuate', '|')),
    (12, 'Propina', 'Comidas', 100.00, 'MXN', 1.0000, 'MXN', 100.00, 'Cuate', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (13, 'Propina', 'Comidas', 200.00, 'MXN', 1.0000, 'MXN', 200.00, 'Memo', '2026-02-17', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (14, 'Tarifa puerto', 'Transporte', 360.00, 'MXN', 1.0000, 'MXN', 360.00, 'Memo', '2026-02-18', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (15, 'Desayuno', 'Comidas', 500.00, 'MXN', 1.0000, 'MXN', 500.00, 'Cuate', '2026-02-18', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (16, 'Comida ferry', 'Comidas', 400.00, 'MXN', 1.0000, 'MXN', 400.00, 'Memo', '2026-02-18', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (17, 'Baja Mia', 'Comidas', 2600.00, 'MXN', 1.0000, 'MXN', 2600.00, 'Cuate', '2026-02-19', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (18, 'Buena vida rest', 'Comidas', 1800.00, 'MXN', 1.0000, 'MXN', 1800.00, 'Memo', '2026-02-19', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (19, 'Cena zopilote', 'Comidas', 1000.00, 'MXN', 1.0000, 'MXN', 1000.00, 'Beto', '2026-02-19', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (20, 'Desayuno Loreto', 'Comidas', 920.00, 'MXN', 1.0000, 'MXN', 920.00, 'Cuate', '2026-02-20', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (21, 'Comida', 'Comidas', 868.00, 'MXN', 1.0000, 'MXN', 868.00, 'Cuate', '2026-02-20', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (22, 'Hotel Guerrero Negro', 'Hospedaje', 1700.00, 'MXN', 1.0000, 'MXN', 1700.00, 'Beto', '2026-02-20', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (23, 'Oxxo', 'Comidas', 120.00, 'MXN', 1.0000, 'MXN', 120.00, 'Beto', '2026-02-20', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (24, 'Hamburguezas', 'Comidas', 650.00, 'MXN', 1.0000, 'MXN', 650.00, 'Beto', '2026-02-20', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (25, 'Hamburguezas', 'Comidas', 50.00, 'MXN', 1.0000, 'MXN', 50.00, 'Memo', '2026-02-20', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (26, 'Hotel San Quintin', 'Hospedaje', 222.00, 'USD', 18.0000, 'MXN', 3996.00, 'Beto', '2026-02-21', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (27, 'Mama espinoza', 'Comidas', 2100.00, 'MXN', 1.0000, 'MXN', 2100.00, 'Memo', '2026-02-21', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (28, 'La Ostioneria', 'Comidas', 700.00, 'MXN', 1.0000, 'MXN', 700.00, 'Beto', '2026-02-21', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (29, 'La Ostioneria', 'Comidas', 100.00, 'MXN', 1.0000, 'MXN', 100.00, 'Memo', '2026-02-21', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (30, 'Bar hotel', 'Comidas', 490.00, 'MXN', 1.0000, 'MXN', 490.00, 'Cuate', '2026-02-21', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (31, 'Desayuno la cienega', 'Comidas', 1080.00, 'MXN', 1.0000, 'MXN', 1080.00, 'Cuate', '2026-02-22', NULL, string_to_array('Beto|Memo|Cuate', '|')),
    (32, 'Hotel', 'Hospedaje', 915.00, 'USD', 18.0000, 'MXN', 16470.00, 'Memo', '2026-02-22', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (33, 'Raising Canes', 'Comidas', 61.00, 'USD', 18.0000, 'MXN', 1098.00, 'Cuate', '2026-02-22', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (34, 'Uber parque y wawa', 'Transporte', 47.00, 'USD', 18.0000, 'MXN', 846.00, 'Memo', '2026-02-22', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (35, 'Mitch seafood', 'Comidas', 133.00, 'USD', 18.0000, 'MXN', 2394.00, 'Cuate', '2026-02-22', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (36, 'Uber a hotel', 'Transporte', 11.00, 'USD', 18.0000, 'MXN', 198.00, 'Memo', '2026-02-22', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (37, 'Estacionamiento hotel', 'Estacionamiento', 75.00, 'USD', 18.0000, 'MXN', 1350.00, 'Memo', '2026-02-22', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (38, 'Uber Aeropuerto', 'Transporte', 33.00, 'USD', 18.0000, 'MXN', 594.00, 'Memo', '2026-02-24', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|')),
    (39, 'Sonic', 'Comidas', 52.00, 'USD', 18.0000, 'MXN', 936.00, 'Cuate', '2026-02-24', 'Gasto generado en USD', string_to_array('Beto|Memo|Cuate', '|'))
),
inserted_expenses as (
  insert into trip_expenses (trip_slug, concept, category, amount, currency, exchange_rate, base_currency, base_amount, paid_by, notes, expense_date)
  select
    'baja-etapa-1',
    e.concept,
    e.category,
    e.amount,
    e.currency,
    e.exchange_rate,
    e.base_currency,
    e.base_amount,
    p.id,
    e.notes,
    e.expense_date
  from expenses_seed e
  join participant_ids p on p.name = e.payer_name
  order by e.seed_idx
  returning id
),
inserted_expenses_numbered as (
  select id, row_number() over (order by id) as seed_idx
  from inserted_expenses
)
insert into expense_splits (expense_id, participant_id)
select ie.id, p.id
from expenses_seed e
join inserted_expenses_numbered ie on ie.seed_idx = e.seed_idx
join lateral unnest(e.split_names) as split_name(name) on true
join participant_ids p on p.name = split_name.name;

commit;
