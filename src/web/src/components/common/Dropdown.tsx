import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { Menu } from '@headlessui/react'; // ^1.7.0
import { Icon } from './Icon';
import { Button } from './Button';
import { COLORS, TYPOGRAPHY, TV_THEME } from '../../constants/theme.constants';

// Interface for dropdown options
interface DropdownOption {
  value: string | number;
  label: string;
  icon?: string;
  disabled?: boolean;
  focusKey?: string;
}

// Interface for dropdown props
interface DropdownProps {
  options: DropdownOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  isTv?: boolean;
  highContrast?: boolean;
  ariaLabel?: string;
}

// Custom hook for TV navigation
const useTvNavigation = (isTv: boolean) => {
  const [focusVisible, setFocusVisible] = React.useState(false);

  React.useEffect(() => {
    if (!isTv) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        setFocusVisible(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTv]);

  return { focusVisible };
};

// Generate dropdown classes based on props
const getDropdownClasses = ({
  disabled,
  isTv,
  highContrast,
  className
}: Partial<DropdownProps>): string => {
  return classnames(
    'relative inline-block w-full',
    {
      'opacity-50 cursor-not-allowed': disabled,
      'text-2xl': isTv,
      'border-2 border-black dark:border-white': highContrast,
      'motion-reduce:transition-none': true
    },
    className
  );
};

export const Dropdown = React.memo<DropdownProps>(({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  className,
  isTv = false,
  highContrast = false,
  ariaLabel
}) => {
  const { focusVisible } = useTvNavigation(isTv);
  const selectedOption = options.find(opt => opt.value === value);

  // Handle option selection
  const handleSelect = (optionValue: string | number) => {
    if (!disabled) {
      onChange(optionValue);
    }
  };

  // Render individual option
  const renderOption = (option: DropdownOption) => (
    <Menu.Item key={option.value}>
      {({ active }) => (
        <button
          className={classnames(
            'flex items-center w-full px-4 text-left',
            isTv ? 'py-4 text-lg' : 'py-2 text-sm',
            {
              'bg-primary-50 text-primary-900': active || value === option.value,
              'text-gray-900': !active && value !== option.value,
              'opacity-50 cursor-not-allowed': option.disabled,
              'focus:ring-4 focus:ring-primary-500': isTv && focusVisible,
              'high-contrast': highContrast
            }
          )}
          onClick={() => handleSelect(option.value)}
          disabled={option.disabled}
          data-focus-key={option.focusKey}
          role="menuitem"
          aria-selected={value === option.value}
        >
          {option.icon && (
            <Icon
              name={option.icon}
              size={isTv ? 'lg' : 'md'}
              className="mr-3"
              ariaLabel={`${option.label} icon`}
              isTv={isTv}
              highContrast={highContrast}
            />
          )}
          <span>{option.label}</span>
          {value === option.value && (
            <Icon
              name="check"
              size={isTv ? 'lg' : 'md'}
              className="ml-auto"
              ariaLabel="Selected"
              isTv={isTv}
              highContrast={highContrast}
            />
          )}
        </button>
      )}
    </Menu.Item>
  );

  return (
    <Menu as="div" className={getDropdownClasses({ disabled, isTv, highContrast, className })}>
      {({ open }) => (
        <>
          <Menu.Button
            as={Button}
            disabled={disabled}
            className={classnames(
              'w-full justify-between',
              isTv && 'text-lg py-4',
              highContrast && 'high-contrast'
            )}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="true"
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <Icon
              name={open ? 'chevron-up' : 'chevron-down'}
              size={isTv ? 'lg' : 'md'}
              className="ml-2"
              ariaLabel={open ? 'Close menu' : 'Open menu'}
              isTv={isTv}
              highContrast={highContrast}
            />
          </Menu.Button>

          <Menu.Items
            className={classnames(
              'absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg',
              isTv && 'mt-2 py-2',
              highContrast && 'border-2 border-black dark:border-white'
            )}
            role="menu"
            aria-orientation="vertical"
            aria-labelledby={ariaLabel}
          >
            <div className="py-1" role="none">
              {options.map(renderOption)}
            </div>
          </Menu.Items>
        </>
      )}
    </Menu>
  );
});

Dropdown.displayName = 'Dropdown';

export default Dropdown;