import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import Avatar from '../common/Avatar';
import SearchBar from '../search/SearchBar';
import Button from '../common/Button';
import useAuth from '../../hooks/useAuth';
import useTvNavigation from '../../hooks/useTvNavigation';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';

interface HeaderProps {
  className?: string;
  showSearch?: boolean;
  isTvMode?: boolean;
  initialFocusIndex?: number;
  onFocusChange?: (index: number) => void;
  highContrastMode?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  className,
  showSearch = true,
  isTvMode = false,
  initialFocusIndex,
  onFocusChange,
  highContrastMode = false
}) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // TV navigation setup
  const { focusedElement, navigateToElement } = useTvNavigation({
    initialFocusId: initialFocusIndex ? `header-item-${initialFocusIndex}` : undefined,
    onNavigate: (direction) => {
      if (direction === 'down' && isSearchFocused) {
        setIsSearchFocused(false);
      }
    }
  });

  // Handle profile navigation
  const handleProfileClick = useCallback(() => {
    navigate('/profile');
  }, [navigate]);

  // Handle sign out with cleanup
  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }, [signOut, navigate]);

  // Update focus when search state changes
  useEffect(() => {
    if (onFocusChange) {
      const index = focusedElement?.getAttribute('data-focus-index');
      if (index) {
        onFocusChange(parseInt(index));
      }
    }
  }, [focusedElement, onFocusChange]);

  return (
    <header
      className={classNames(
        'fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 shadow-md transition-colors duration-200',
        highContrastMode && 'high-contrast:border-2 high-contrast:border-white high-contrast:bg-black high-contrast:text-white',
        className
      )}
    >
      <div className="container mx-auto px-4 h-16 tv:h-24 flex items-center justify-between">
        {/* Logo */}
        <button
          id="header-item-0"
          className={classNames(
            'text-2xl tv:text-4xl font-bold text-primary-600 dark:text-primary-400',
            'focus-visible:ring-2 focus-visible:ring-primary-500',
            TV_FOCUS_CLASSES.FOCUS
          )}
          onClick={() => navigate('/')}
          data-focus-index="0"
        >
          MemoryReel
        </button>

        {/* Search Bar */}
        {showSearch && (
          <div className="flex-1 max-w-2xl mx-4 tv:mx-8">
            <SearchBar
              id="header-item-1"
              className={classNames(
                'w-full',
                isTvMode && 'tv:py-4 tv:text-xl'
              )}
              placeholder="Search memories..."
              voiceEnabled={true}
              aiAssistant={true}
              onFocusChange={(focused) => setIsSearchFocused(focused)}
              data-focus-index="1"
            />
          </div>
        )}

        {/* User Actions */}
        <div className="flex items-center space-x-4 tv:space-x-6">
          {user ? (
            <>
              <Avatar
                id="header-item-2"
                user={user}
                size={isTvMode ? 'lg' : 'md'}
                onClick={handleProfileClick}
                focusable={true}
                data-focus-index="2"
              />
              <Button
                id="header-item-3"
                variant="text"
                onClick={handleSignOut}
                className={classNames(
                  'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                  isTvMode && 'tv:text-lg'
                )}
                ariaLabel="Sign out"
                data-focus-index="3"
              >
                Sign Out
              </Button>
            </>
          ) : (
            <Button
              id="header-item-2"
              variant="primary"
              onClick={() => navigate('/login')}
              className={isTvMode && 'tv:text-lg tv:py-3 tv:px-6'}
              ariaLabel="Sign in"
              data-focus-index="2"
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default React.memo(Header);