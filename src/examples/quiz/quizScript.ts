/**
 * The shape of a scripted question flow, and a sample script.
 *
 * This is EXAMPLE code, not part of the SDK surface: the engine only knows
 * about a message carrying `quickReplies` and about sending the tapped value
 * back into the room. Everything below - the notion of a "step", the order
 * they run in, where the answers pile up - belongs to whoever drives the
 * flow, whether that is a bot on the server or a host page like this one.
 *
 * The step types mirror the node palette of the flow builders these widgets
 * are usually compared against (Say / Single Input / Options / Yes-No /
 * Rating), minus the branching nodes.
 */

export type QuizStepType = 'say' | 'input' | 'choice' | 'yesno' | 'rating';

export interface QuizOption {
  name: string;
  value: string;
}

export interface QuizStep {
  /** Echoed back as `questionId` when one of this step's buttons is tapped. */
  id: string;
  type: QuizStepType;
  /** What the bot says. */
  text: string;
  /** Short name for the closing summary. Falls back to `text`. */
  label?: string;
  /** Only for `choice`; `yesno` and `rating` synthesise their own. */
  options?: QuizOption[];
}

const YES_NO: QuizOption[] = [
  { name: 'Yes', value: 'Yes' },
  { name: 'No', value: 'No' },
];

const RATING: QuizOption[] = [1, 2, 3, 4, 5].map((n) => ({
  name: String(n),
  value: String(n),
}));

/** Buttons a step offers. `say` and `input` steps offer none. */
export function optionsForStep(step: QuizStep): QuizOption[] {
  if (step.type === 'yesno') return YES_NO;
  if (step.type === 'rating') return RATING;
  if (step.type === 'choice') return step.options ?? [];
  return [];
}

/**
 * A six-question intake, written as an eye clinic's because that is the
 * kind of site these flows land on. Deliberately mixes button steps with
 * typed ones: a name and a contact detail cannot be picked from a list, and
 * the two answer paths are the thing worth demonstrating.
 */
export const DEFAULT_QUIZ_SCRIPT: QuizStep[] = [
  {
    id: 'intro',
    type: 'say',
    text: "I'll ask you 6 short questions and we will review your options together.",
  },
  {
    id: 'name',
    type: 'input',
    label: 'Name',
    text: "Let's begin - what is your name?",
  },
  {
    id: 'vision',
    type: 'choice',
    label: 'Trouble seeing',
    text: 'Do you have trouble seeing far away, near, or a combination?',
    options: [
      { name: 'Far', value: 'Far' },
      { name: 'Near', value: 'Near' },
      { name: 'Both', value: 'Both' },
      { name: 'N/A', value: 'N/A' },
    ],
  },
  {
    id: 'last-exam',
    type: 'yesno',
    label: 'Exam in the last 12 months',
    text: 'Have you had an eye exam in the last 12 months?',
  },
  {
    id: 'comfort',
    type: 'rating',
    label: 'Comfort with surgery',
    text: 'On a scale of 1 to 5, how comfortable are you with the idea of surgery?',
  },
  {
    id: 'timing',
    type: 'choice',
    label: 'Preferred timing',
    text: 'When would you like to be seen?',
    options: [
      { name: 'This week', value: 'This week' },
      { name: 'In the next two weeks', value: 'In the next two weeks' },
      { name: 'Sometime this month', value: 'Sometime this month' },
      { name: 'Just researching', value: 'Just researching' },
    ],
  },
  {
    id: 'contact',
    type: 'input',
    label: 'Contact',
    text: 'Last one - what is the best email or phone to reach you on?',
  },
];
