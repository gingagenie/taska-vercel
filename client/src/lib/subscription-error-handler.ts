import { showSubscriptionErrorModal } from '@/components/modals/subscription-error-modal';

// Handle subscription-related API errors
export function handleSubscriptionError(error: Error) {
  console.log('[DEBUG] Handling subscription error:', error.message);
  const message = error.message;
  
  try {
    // Try to parse the error response for better handling
    const responseText = message.split(': ')[1] || message;
    console.log('[DEBUG] Parsing response text:', responseText);
    const errorData = JSON.parse(responseText);
    console.log('[DEBUG] Parsed error data:', errorData);
    
    if (errorData.code === 'TRIAL_EXPIRED') {
      // Show a beautiful upgrade modal instead of harsh redirect
      console.log('[DEBUG] Showing TRIAL_EXPIRED modal');
      showUpgradeModal({
        title: '🔒 Trial Expired',
        message: errorData.message || 'Your 14-day trial has expired. Upgrade now to continue!',
        action: errorData.action
      });
      return true;
    }
    
    if (errorData.code === 'SUBSCRIPTION_REQUIRED') {
      // Show upgrade modal for premium features
      console.log('[DEBUG] Showing SUBSCRIPTION_REQUIRED modal');
      showUpgradeModal({
        title: '💎 Premium Feature',
        message: errorData.message || 'This feature requires an active subscription.',
        action: errorData.action
      });
      return true;
    }
  } catch (parseError) {
    console.log('[DEBUG] JSON parse failed:', parseError);
    // Fallback for older error format
    if (message.includes('TRIAL_EXPIRED') || message.includes('trial has expired')) {
      console.log('[DEBUG] Showing fallback TRIAL_EXPIRED modal');
      showUpgradeModal({
        title: '🔒 Trial Expired',
        message: 'Your 14-day trial has expired. Upgrade now to continue using Taska!',
        action: { label: 'Upgrade Now', url: '/subscription' }
      });
      return true;
    }
    
    if (message.includes('SUBSCRIPTION_REQUIRED') || message.includes('subscription required')) {
      console.log('[DEBUG] Showing fallback SUBSCRIPTION_REQUIRED modal');
      showUpgradeModal({
        title: '💎 Premium Feature',
        message: 'This feature requires an active subscription to access.',
        action: { label: 'Upgrade Now', url: '/subscription' }
      });
      return true;
    }
  }
  
  console.log('[DEBUG] Error not handled, returning false');
  return false; // Not handled
}

// Show a beautiful upgrade modal
function showUpgradeModal(options: {
  title: string;
  message: string;
  action?: { label: string; url: string };
}) {
  console.log('[DEBUG] showUpgradeModal called with:', options);
  showSubscriptionErrorModal(options);
}

// Enhanced error message for subscription issues
export function getSubscriptionErrorMessage(error: Error): string {
  const message = error.message;
  
  if (message.includes('TRIAL_EXPIRED') || message.includes('trial has expired')) {
    return 'Your 14-day trial has expired. Please upgrade to continue using Taska.';
  }
  
  if (message.includes('SUBSCRIPTION_REQUIRED') || message.includes('subscription required')) {
    return 'A subscription is required to access this feature.';
  }
  
  return message;
}