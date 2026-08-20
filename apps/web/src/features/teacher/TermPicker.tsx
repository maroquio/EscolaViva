import { Button, Group } from '@mantine/core';
import { SECONDARY_BUTTON } from '../../shared/ui/constants';
import { CHOSEN_TERM, CHOSEN_TERM_BUTTON, termInWords } from './constants';
import { TERMS, type Term } from './useTerm';

export type TermPickerProps = {
  readonly term: Term;
  readonly onTermChosen: (term: Term) => void;
};

export function TermPicker({ term, onTermChosen }: TermPickerProps): React.ReactElement {
  return (
    <Group>
      {TERMS.map((option) => (
        <Button
          key={option}
          variant={option === term ? CHOSEN_TERM_BUTTON : SECONDARY_BUTTON}
          size="xs"
          onClick={() => onTermChosen(option)}
          aria-current={option === term ? CHOSEN_TERM : undefined}
        >
          {termInWords(option)}
        </Button>
      ))}
    </Group>
  );
}
