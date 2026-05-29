import { cleanOcrText } from '../src/utils/cleanOcrText';

describe('cleanOcrText', () => {
  it('removes status bar timestamps', () => {
    expect(cleanOcrText('4:18 messenger 9ssin What\'s up?')).toBe(
      "messenger 9ssin What's up?",
    );
  });

  it('removes like counts with K/M suffix', () => {
    expect(cleanOcrText('308K likes on your post')).toBe('likes on your post');
    expect(cleanOcrText('23.5K followers')).toBe('followers');
  });

  it('removes common Instagram / Facebook UI phrases', () => {
    const raw =
      '4:19 + Your story Instagram Liked by user See translation View all comments';
    const cleaned = cleanOcrText(raw);
    expect(cleaned).not.toMatch(/Liked by/i);
    expect(cleaned).not.toMatch(/See translation/i);
    expect(cleaned).not.toMatch(/View all comments/i);
    expect(cleaned).not.toMatch(/Your story/i);
    expect(cleaned).toContain('Instagram');
  });

  it('preserves actionable Derja / French / Arabic content', () => {
    expect(cleanOcrText('9a7ba w 3lik ya khra')).toBe('9a7ba w 3lik ya khra');
    expect(cleanOcrText('je vais te baiser')).toBe('je vais te baiser');
    expect(cleanOcrText('سلام عليكم')).toBe('سلام عليكم');
  });

  it('handles empty input', () => {
    expect(cleanOcrText('')).toBe('');
  });
});
