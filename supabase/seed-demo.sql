-- Sample data for trying the guest screens. Do not run this on the real game.
insert into functions (name, sort_order) values ('Sangeet', 1), ('Baraat', 2), ('Ceremony', 3), ('Reception', 4);

insert into guests (display_name) values
  ('Priya Sharma'), ('Rohan Mehta'), ('Anjali Patel'), ('Vikram Rao'),
  ('Sara Thomas'), ('Dev Iyer'), ('Meera Nair'), ('Arjun Kapoor');

with e as (
  insert into events (function_id, question, status, lock_at, sort_order)
  select f.id, v.question, 'open', now() + v.lock_in, v.ord
  from (values
    ('Sangeet', 'Which side wins the dance-off?', interval '3 hours', 1),
    ('Baraat', 'How late does the Baraat arrive?', interval '2 days', 2),
    ('Ceremony', 'Who cries first?', interval '26 hours', 3),
    ('Reception', 'How long is the longest speech?', null, 4)
  ) as v (fn, question, lock_in, ord)
  join functions f on f.name = v.fn
  returning id, question
)
insert into outcomes (event_id, label, odds, sort_order)
select e.id, o.label, o.odds, o.ord
from e join (values
  ('Which side wins the dance-off?', 'Bride''s side', 1.8, 1),
  ('Which side wins the dance-off?', 'Groom''s side', 2.2, 2),
  ('How late does the Baraat arrive?', 'On time', 8, 1),
  ('How late does the Baraat arrive?', '1-15 min', 3, 2),
  ('How late does the Baraat arrive?', '16-30 min', 2, 3),
  ('How late does the Baraat arrive?', '31+ min', 2.5, 4),
  ('Who cries first?', 'Bride', 2.5, 1),
  ('Who cries first?', 'Groom', 3.5, 2),
  ('Who cries first?', 'A parent', 1.5, 3),
  ('Who cries first?', 'Other', 6, 4),
  ('How long is the longest speech?', 'Under 3 min', 5, 1),
  ('How long is the longest speech?', '3-5 min', 2.5, 2),
  ('How long is the longest speech?', '6-10 min', 2, 3),
  ('How long is the longest speech?', 'Over 10 min', 3, 4)
) as o (question, label, odds, ord) on o.question = e.question;
