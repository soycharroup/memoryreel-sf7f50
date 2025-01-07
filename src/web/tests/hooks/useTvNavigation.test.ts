import { renderHook, act } from '@testing-library/react-hooks';
import { fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';
import { useTvNavigation } from '../../src/hooks/useTvNavigation';
import { TV_NAVIGATION, TV_REMOTE_KEYS, TV_FOCUS_CLASSES } from '../../src/constants/tv.constants';

// Mock window methods and properties
const mockVibrate = jest.fn();
Object.defineProperty(window.navigator, 'vibrate', {
  value: mockVibrate,
  writable: true
});

// Mock requestAnimationFrame
global.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
global.cancelAnimationFrame = jest.fn();

describe('useTvNavigation', () => {
  // Mock DOM elements and functions
  let mockElements: HTMLElement[];
  let container: HTMLElement;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockVibrate.mockClear();

    // Set up DOM environment
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create mock focusable elements
    mockElements = Array.from({ length: 4 }, (_, i) => {
      const element = document.createElement('button');
      element.id = `element-${i}`;
      element.setAttribute('tabindex', '0');
      element.getBoundingClientRect = () => ({
        top: 100 * i,
        bottom: 100 * i + 50,
        left: 100 * i,
        right: 100 * i + 50,
        width: 50,
        height: 50,
        x: 100 * i,
        y: 100 * i,
        toJSON: () => {}
      });
      container.appendChild(element);
      return element;
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  it('should initialize with default options', () => {
    const { result } = renderHook(() => useTvNavigation());
    
    expect(result.current.focusedElement).toBeNull();
    expect(typeof result.current.handleKeyPress).toBe('function');
    expect(typeof result.current.navigateToElement).toBe('function');
    expect(result.current.isLongPress).toBe(false);
  });

  it('should initialize with initial focus element', () => {
    const initialFocusId = 'element-0';
    jest.useFakeTimers();

    const { result } = renderHook(() => 
      useTvNavigation({ initialFocusId })
    );

    act(() => {
      jest.advanceTimersByTime(TV_NAVIGATION.FOCUS_DELAY);
    });

    expect(result.current.focusedElement).toBe(mockElements[0]);
    expect(mockElements[0].classList.contains(TV_FOCUS_CLASSES.FOCUS_VISIBLE)).toBe(true);
  });

  it('should handle directional navigation', () => {
    const onNavigate = jest.fn();
    const { result } = renderHook(() => 
      useTvNavigation({ onNavigate })
    );

    // Focus initial element
    act(() => {
      result.current.navigateToElement('element-0');
    });

    // Test right navigation
    act(() => {
      fireEvent.keyDown(window, { keyCode: TV_REMOTE_KEYS.RIGHT });
    });

    expect(result.current.focusedElement).toBe(mockElements[1]);
    expect(onNavigate).toHaveBeenCalledWith('right');
  });

  it('should handle long press detection', () => {
    jest.useFakeTimers();
    const onLongPress = jest.fn();
    const { result } = renderHook(() => 
      useTvNavigation({ onLongPress })
    );

    // Focus and trigger long press
    act(() => {
      result.current.navigateToElement('element-0');
      fireEvent.mouseDown(window);
    });

    act(() => {
      jest.advanceTimersByTime(800); // LONG_PRESS_DURATION
    });

    expect(onLongPress).toHaveBeenCalledWith(mockElements[0]);
    expect(result.current.isLongPress).toBe(true);

    // Test long press release
    act(() => {
      fireEvent.mouseUp(window);
    });

    expect(result.current.isLongPress).toBe(false);
  });

  it('should manage haptic feedback', () => {
    const { result } = renderHook(() => 
      useTvNavigation({ hapticFeedback: true })
    );

    act(() => {
      result.current.navigateToElement('element-0');
    });

    expect(mockVibrate).toHaveBeenCalledWith(50); // HAPTIC_DURATION
  });

  it('should handle focus trap behavior', () => {
    const { result } = renderHook(() => 
      useTvNavigation({ focusTrap: true })
    );

    // Focus last element
    act(() => {
      result.current.navigateToElement('element-3');
    });

    // Try to navigate past the last element
    act(() => {
      fireEvent.keyDown(window, { keyCode: TV_REMOTE_KEYS.RIGHT });
    });

    // Should wrap to first element
    expect(result.current.focusedElement).toBe(mockElements[0]);
  });

  it('should handle select and back actions', () => {
    const onSelect = jest.fn();
    const onBack = jest.fn();
    const { result } = renderHook(() => 
      useTvNavigation({ onSelect, onBack })
    );

    // Focus and select element
    act(() => {
      result.current.navigateToElement('element-0');
      fireEvent.keyDown(window, { keyCode: TV_REMOTE_KEYS.SELECT });
    });

    expect(onSelect).toHaveBeenCalledWith(mockElements[0]);

    // Test back action
    act(() => {
      fireEvent.keyDown(window, { keyCode: TV_REMOTE_KEYS.BACK });
    });

    expect(onBack).toHaveBeenCalled();
  });

  it('should clean up event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useTvNavigation());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('should handle home button navigation', () => {
    const onHome = jest.fn();
    const { result } = renderHook(() => 
      useTvNavigation({ onHome })
    );

    act(() => {
      fireEvent.keyDown(window, { keyCode: TV_REMOTE_KEYS.HOME });
    });

    expect(onHome).toHaveBeenCalled();
  });

  it('should reset navigation state', () => {
    const { result } = renderHook(() => useTvNavigation());

    // Set initial focus
    act(() => {
      result.current.navigateToElement('element-0');
    });

    expect(result.current.focusedElement).toBe(mockElements[0]);

    // Reset navigation
    act(() => {
      result.current.resetNavigation();
    });

    expect(result.current.focusedElement).toBeNull();
    expect(result.current.isLongPress).toBe(false);
    expect(mockElements[0].classList.contains(TV_FOCUS_CLASSES.FOCUS_VISIBLE)).toBe(false);
  });
});