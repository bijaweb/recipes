-- Meal planner becomes per user (2026-10-30). Each recipes_meal_plan row
-- belongs to one recipes_users row; an admin can point a user at someone
-- else's plan from Manage Users on bijacorp.com (linked_user_id), like
-- Toddler and Roulette. The two rows that existed went to the only user then.
-- Apply as myapp_user. The NOT NULL step runs after the API that writes
-- user_id is deployed.
ALTER TABLE recipes_users
  ADD COLUMN IF NOT EXISTS linked_user_id integer REFERENCES recipes_users(id) ON DELETE SET NULL;
ALTER TABLE recipes_meal_plan
  ADD COLUMN IF NOT EXISTS user_id integer REFERENCES recipes_users(id) ON DELETE CASCADE;
UPDATE recipes_meal_plan
  SET user_id = (SELECT id FROM recipes_users WHERE email = 'r62656e@gmail.com')
  WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS recipes_meal_plan_user_date_idx ON recipes_meal_plan (user_id, date);
-- After deploy:
-- ALTER TABLE recipes_meal_plan ALTER COLUMN user_id SET NOT NULL;
