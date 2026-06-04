-- Media literacy / violence quiz for gore & violent content missions
-- Idempotent: skips rows that already exist (safe if 011 migration was applied manually).

INSERT INTO quiz_questions (quiz_type, question_text, options, correct_answer_index, age_min, age_max)
SELECT v.quiz_type, v.question_text, v.options, v.correct_answer_index, v.age_min, v.age_max
FROM (VALUES
  ('media_violence', 'You see a graphic violent video online. What should you do first?',
   ARRAY['Share it with friends', 'Close it and tell a trusted adult', 'Watch more to understand', 'Save it for later']::text[], 1, 0, 99),
  ('media_violence', 'Why is it harmful to share violent or gore images?',
   ARRAY['It can upset people and get you in trouble', 'Everyone loves them', 'It makes you famous', 'It is always allowed online']::text[], 0, 0, 99),
  ('media_violence', 'You searched for violent images out of curiosity. A better choice next time is to…',
   ARRAY['Search for more', 'Ask a parent why that content is harmful', 'Post what you found', 'Ignore your feelings']::text[], 1, 0, 99),
  ('media_violence', 'A game shows very realistic blood and fighting. What is a healthy response?',
   ARRAY['Play for hours without breaks', 'Copy the violence with friends', 'Talk to a parent if it makes you uncomfortable', 'Share screenshots online']::text[], 2, 0, 99),
  ('media_violence', 'Someone sends you a violent meme in a group chat. You should…',
   ARRAY['Forward it to others', 'Report or block and tell an adult', 'Reply with something meaner', 'Save it secretly']::text[], 1, 0, 99),
  ('media_violence', 'Movies and games often fake violence with special effects. Real violence is…',
   ARRAY['Always funny', 'Harmful and not entertainment', 'The same as a video game', 'Something cool to copy']::text[], 1, 0, 99),
  ('media_violence', 'You feel scared after seeing gore online. Who can help you feel safe?',
   ARRAY['Nobody — keep it secret', 'A trusted adult or parent', 'Random strangers online', 'Only your friends']::text[], 1, 0, 99),
  ('media_violence', 'Why do apps like SafeGuard flag violent searches?',
   ARRAY['To punish you', 'To protect you and help you make safer choices', 'To spy for fun', 'To delete your photos']::text[], 1, 8, 99)
) AS v(quiz_type, question_text, options, correct_answer_index, age_min, age_max)
WHERE NOT EXISTS (
  SELECT 1 FROM quiz_questions q
  WHERE q.quiz_type = v.quiz_type AND q.question_text = v.question_text
);
