-- Dev-only test users (safe to run multiple times)
INSERT INTO users (id, email, role, password_hash)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'parent@test.local', 'parent', 'dev'),
  ('22222222-2222-2222-2222-222222222222', 'child@test.local', 'child', 'dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO children (id, user_id, parent_id, display_name, birth_year)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Test Child',
  2014
)
ON CONFLICT (id) DO NOTHING;
