import React, { useId, useCallback, useState, useRef, useEffect, memo } from 'react';
import classNames from 'classnames'; // v2.3.2
import { useForm, useFormContext } from 'react-hook-form'; // v7.0.0
import inputMask from 'input-mask'; // v1.2.0
import { validateUserCredentials } from '../../utils/validation.util';

interface InputProps {
  id?: string;
  name: string;
  type?: 'text' | 'password' | 'email' | 'tel' | 'number' | 'search';
  value?: string;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'search';
  pattern?: string;
  validate?: (value: string) => boolean | string;
  mask?: string;
  customStyles?: {
    container?: string;
    input?: string;
    label?: string;
    error?: string;
  };
  showPasswordToggle?: boolean;
  helpText?: string;
}

const Input = memo(({
  id: providedId,
  name,
  type = 'text',
  value: initialValue = '',
  placeholder,
  label,
  error,
  disabled = false,
  required = false,
  onChange,
  onBlur,
  onFocus,
  className,
  autoFocus = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
  inputMode,
  pattern,
  validate,
  mask,
  customStyles = {},
  showPasswordToggle = false,
  helpText
}: InputProps) => {
  const id = useId();
  const inputId = providedId || `input-${id}`;
  const errorId = `${inputId}-error`;
  const helpTextId = `${inputId}-help`;
  
  const [value, setValue] = useState(initialValue);
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const maskInstance = useRef<any>(null);
  
  const formContext = useFormContext();
  const isFormControlled = !!formContext;

  // Initialize input mask if provided
  useEffect(() => {
    if (mask && inputRef.current) {
      maskInstance.current = inputMask(inputRef.current, {
        mask,
        onComplete: (value: string) => handleChange(value)
      });
      
      return () => maskInstance.current?.destroy();
    }
  }, [mask]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement> | string) => {
    const newValue = typeof event === 'string' ? event : event.target.value;
    setValue(newValue);
    
    if (validate) {
      const validationResult = validate(newValue);
      if (typeof validationResult === 'string') {
        formContext?.setError(name, { message: validationResult });
      }
    }
    
    onChange?.(newValue);
  }, [name, onChange, validate, formContext]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  const baseInputStyles = classNames(
    'w-full px-4 py-2 border rounded-base font-family-primary text-base transition-base focus:outline-none focus:ring-2',
    {
      'border-gray-300 focus:border-primary-color focus:ring-primary-color/20': !error && !disabled,
      'border-error-color focus:border-error-color focus:ring-error-color/20': error,
      'bg-gray-100 cursor-not-allowed opacity-75': disabled,
      'pl-10': showPasswordToggle
    },
    customStyles.input,
    className
  );

  const inputType = showPasswordToggle && showPassword ? 'text' : type;

  return (
    <div className={classNames('relative', customStyles.container)}>
      {label && (
        <label 
          htmlFor={inputId}
          className={classNames(
            'block mb-2 text-sm font-medium',
            customStyles.label
          )}
        >
          {label}
          {required && <span className="text-error-color ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type={inputType}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className={baseInputStyles}
          autoFocus={autoFocus}
          aria-label={ariaLabel || label}
          aria-invalid={ariaInvalid || !!error}
          aria-describedby={classNames(
            error ? errorId : null,
            helpText ? helpTextId : null,
            ariaDescribedby
          )}
          inputMode={inputMode}
          pattern={pattern}
        />

        {showPasswordToggle && (
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        )}
      </div>

      {error && (
        <p
          id={errorId}
          className={classNames(
            'text-error-color text-sm mt-1',
            customStyles.error
          )}
          aria-live="polite"
        >
          {error}
        </p>
      )}

      {helpText && (
        <p
          id={helpTextId}
          className="text-gray-600 text-sm mt-1"
        >
          {helpText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;