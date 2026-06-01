-- Sprint 5.5: dynamic quiz question bank (age-filtered)
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_type VARCHAR(50) NOT NULL,
  question_text TEXT NOT NULL,
  options TEXT[] NOT NULL,
  correct_answer_index INT NOT NULL CHECK (correct_answer_index >= 0 AND correct_answer_index <= 3),
  age_min INT DEFAULT 0,
  age_max INT DEFAULT 99,
  difficulty INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quiz_questions_type_age ON quiz_questions (quiz_type, age_min, age_max);

INSERT INTO quiz_questions (quiz_type, question_text, options, correct_answer_index, age_min, age_max) VALUES
('safety', 'What should you do if a stranger asks for your password online?', ARRAY['Give it to them', 'Ask a parent or trusted adult', 'Reply with a fake password', 'Ignore and block'], 1, 0, 99),
('safety', 'Which of these is a strong password?', ARRAY['123456', 'password', 'Myp@ssw0rd!23', 'qwerty'], 2, 0, 99),
('safety', 'Your friend shares a private photo of another classmate. What do you do?', ARRAY['Share it too', 'Keep it secret', 'Tell a teacher or parent', 'Post it online'], 2, 0, 99),
('safety', 'Someone you do not know sends a link in a game chat. You should…', ARRAY['Click it right away', 'Ask a parent before clicking', 'Share it with friends', 'Post it online'], 1, 0, 99),
('safety', 'A website asks for your home address to win a prize. Best choice?', ARRAY['Type your address', 'Close the page and tell an adult', 'Use a fake name only', 'Ignore forever'], 1, 0, 99),
('conflict', 'A classmate spreads a rumor about you. Best response?', ARRAY['Spread a rumor back', 'Talk to a trusted adult', 'Fight them', 'Ignore them forever'], 1, 0, 99),
('conflict', 'How can you calm down when you are angry?', ARRAY['Yell at someone', 'Take deep breaths', 'Break something', 'Run away'], 1, 0, 99),
('conflict', 'You and a friend disagree about a game. The best first step is…', ARRAY['Listen to their side calmly', 'Stop being friends', 'Yell until they agree', 'Quit the game angrily'], 0, 0, 99),
('conflict', 'After a fight with a sibling, a good way to fix it is to…', ARRAY['Ignore them for a week', 'Blame them to your parents', 'Talk it out and apologise if needed', 'Say hurtful things'], 2, 0, 99),
('conflict', 'Someone is being mean to you in a group chat. You should…', ARRAY['Be mean back', 'Block/report and tell a parent', 'Share their messages', 'Give them your password'], 1, 0, 99),
('empathy', 'Your friend looks sad. What could you say?', ARRAY['You are being dramatic', 'What is wrong? I am here for you', 'Get over it', 'I don''t care'], 1, 0, 99),
('empathy', 'Why is it important to listen to others?', ARRAY['So you can win arguments', 'To understand their feelings', 'To ignore them later', 'To show you are smarter'], 1, 0, 99),
('empathy', 'A classmate failed a test and feels embarrassed. You could…', ARRAY['Laugh at them', 'Offer encouragement', 'Tell everyone their score', 'Avoid them'], 1, 0, 99),
('empathy', 'Your friend lost their pet. How might they feel?', ARRAY['Happy and excited', 'Sad and in need of comfort', 'Angry at you', 'Bored'], 1, 0, 99);
