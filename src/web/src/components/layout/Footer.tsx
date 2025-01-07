import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { analytics } from '@segment/analytics-next'; // ^1.51.0
import { APP_VERSION, APP_CONFIG } from '../../constants/app.constants';
import Icon from '../common/Icon';
import Button from '../common/Button';

interface FooterProps {
  /** Additional CSS classes for styling customization */
  className?: string;
  /** TV interface optimization flag */
  isTv?: boolean;
  /** Toggle social media links visibility */
  showSocialLinks?: boolean;
  /** Toggle version information visibility */
  showVersion?: boolean;
  /** Additional custom navigation links */
  customLinks?: FooterLink[];
  /** Link click handler for analytics */
  onLinkClick?: (link: FooterLink) => void;
  /** Test identifier for automated testing */
  testId?: string;
}

interface FooterLink {
  id: string;
  label: string;
  href: string;
  icon?: string;
  ariaLabel: string;
}

/**
 * Formats copyright text with proper symbols and year
 */
const formatCopyright = (year: number = new Date().getFullYear()): string => {
  return `© ${year} ${APP_CONFIG.name}. All rights reserved.`;
};

/**
 * Retrieves configured social media links
 */
const getSocialLinks = (): FooterLink[] => [
  {
    id: 'facebook',
    label: 'Facebook',
    href: 'https://facebook.com/memoryreel',
    icon: 'Facebook',
    ariaLabel: 'Visit MemoryReel on Facebook'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://instagram.com/memoryreel',
    icon: 'Instagram',
    ariaLabel: 'Follow MemoryReel on Instagram'
  },
  {
    id: 'twitter',
    label: 'Twitter',
    href: 'https://twitter.com/memoryreel',
    icon: 'Twitter',
    ariaLabel: 'Follow MemoryReel on Twitter'
  }
];

/**
 * Footer component with TV interface optimization and accessibility support
 */
const Footer = React.memo<FooterProps>(({
  className,
  isTv = false,
  showSocialLinks = true,
  showVersion = true,
  customLinks = [],
  onLinkClick,
  testId = 'footer'
}) => {
  // Handle link click with analytics tracking
  const handleLinkClick = React.useCallback((link: FooterLink) => {
    analytics.track('Footer Link Clicked', {
      linkId: link.id,
      linkLabel: link.label,
      linkHref: link.href
    });
    onLinkClick?.(link);
  }, [onLinkClick]);

  // Base styles with TV optimization
  const footerClasses = classnames(
    'w-full py-4 px-6 bg-gray-100 dark:bg-gray-900 transition-colors',
    {
      'py-6 px-8': isTv, // Enhanced spacing for TV
      'text-lg': isTv // Larger text for TV
    },
    className
  );

  // Container styles with responsive layout
  const containerClasses = classnames(
    'max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4',
    {
      'max-w-full gap-8': isTv // Full width for TV
    }
  );

  return (
    <footer 
      className={footerClasses}
      role="contentinfo"
      aria-label="Footer"
      data-testid={testId}
    >
      <div className={containerClasses}>
        {/* Copyright and main links */}
        <div className="flex flex-col items-center md:items-start">
          <p 
            className="text-sm text-gray-600 dark:text-gray-400 font-medium"
            aria-label="Copyright information"
          >
            {formatCopyright()}
          </p>
          
          {/* Custom navigation links */}
          {customLinks.length > 0 && (
            <nav 
              className="mt-2 flex items-center space-x-4"
              aria-label="Footer navigation"
            >
              {customLinks.map((link) => (
                <Button
                  key={link.id}
                  variant="text"
                  size={isTv ? 'lg' : 'sm'}
                  onClick={() => handleLinkClick(link)}
                  ariaLabel={link.ariaLabel}
                >
                  {link.label}
                </Button>
              ))}
            </nav>
          )}
        </div>

        {/* Social links */}
        {showSocialLinks && (
          <div 
            className="flex items-center space-x-4 md:space-x-6"
            role="navigation"
            aria-label="Social media links"
          >
            {getSocialLinks().map((social) => (
              <a
                key={social.id}
                href={social.href}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                onClick={() => handleLinkClick(social)}
                aria-label={social.ariaLabel}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon
                  name={social.icon!}
                  size={isTv ? 'lg' : 'md'}
                  ariaLabel={social.ariaLabel}
                  isTv={isTv}
                  focusable
                />
              </a>
            ))}
          </div>
        )}

        {/* Version information */}
        {showVersion && (
          <div 
            className="text-xs text-gray-500 dark:text-gray-500 mt-2 md:mt-0"
            aria-label="Application version"
          >
            Version {APP_VERSION}
          </div>
        )}
      </div>
    </footer>
  );
});

Footer.displayName = 'Footer';

export default Footer;