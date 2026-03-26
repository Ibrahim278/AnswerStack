import { ActionIcon, Transition } from '@mantine/core';
import { IconArrowDown } from '@tabler/icons-react';

interface ScrollToBottomProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  return (
    <Transition mounted={visible} transition="slide-up" duration={150}>
      {(styles) => (
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          radius="xl"
          onClick={onClick}
          aria-label="Scroll to latest message"
          style={{
            ...styles,
            position: 'absolute',
            bottom: '80px',
            right: '20px',
            zIndex: 10,
            boxShadow: 'var(--mantine-shadow-md)',
          }}
        >
          <IconArrowDown size={20} />
        </ActionIcon>
      )}
    </Transition>
  );
}
