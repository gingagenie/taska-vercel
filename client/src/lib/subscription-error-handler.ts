// Handle subscription-related API errors
export function handleSubscriptionError(error: Error) {
  const message = error.message;
  
  try {
    // Try to parse the error response for better handling
    const responseText = message.split(': ')[1] || message;
    const errorData = JSON.parse(responseText);
    
    if (errorData.code === 'TRIAL_EXPIRED') {
      // Show a beautiful upgrade modal instead of harsh redirect
      showUpgradeModal({
        title: '🔒 Trial Expired',
        message: errorData.message || 'Your 14-day trial has expired. Upgrade now to continue!',
        action: errorData.action
      });
      return true;
    }
    
    if (errorData.code === 'SUBSCRIPTION_REQUIRED') {
      // Show upgrade modal for premium features
      showUpgradeModal({
        title: '💎 Premium Feature',
        message: errorData.message || 'This feature requires an active subscription.',
        action: errorData.action
      });
      return true;
    }
  } catch {
    // Fallback for older error format
    if (message.includes('TRIAL_EXPIRED') || message.includes('trial has expired')) {
      showUpgradeModal({
        title: '🔒 Trial Expired',
        message: 'Your 14-day trial has expired. Upgrade now to continue using Taska!',
        action: { label: 'Upgrade Now', url: '/subscription' }
      });
      return true;
    }
    
    if (message.includes('SUBSCRIPTION_REQUIRED') || message.includes('subscription required')) {
      showUpgradeModal({
        title: '💎 Premium Feature',
        message: 'This feature requires an active subscription to access.',
        action: { label: 'Upgrade Now', url: '/subscription' }
      });
      return true;
    }
  }
  
  return false; // Not handled
}

// Show a beautiful upgrade modal (we'll implement this)
function showUpgradeModal(options: {
  title: string;
  message: string;
  action?: { label: string; url: string };
}) {
  // For now, use a nice alert - later we can make this a proper modal
  const upgrade = confirm(`${options.title}\n\n${options.message}\n\nUpgrade now?`);
  if (upgrade && options.action?.url) {
    window.location.href = options.action.url;
  }
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