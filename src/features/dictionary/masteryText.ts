import type { MasteryLevel } from '@/lib/mastery';

export const MASTERY_EXPLAIN: Record<MasteryLevel, string> = {
  unseen: 'You haven’t answered a question, flashcard or check on this term yet, so there is no mastery estimate.',
  weak: 'Recent answers on this term are mostly wrong or guessed. Review the definition and add it to your flashcards.',
  developing: 'You’re getting there. A few more confident correct answers will lift this.',
  proficient: 'Solid recall. Mastery needs several confident correct answers on at least two different days.',
  mastered: 'Consistent, confident correct answers over time. Older evidence fades, so keep reviewing occasionally.',
};
