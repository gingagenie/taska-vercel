// Handle subscription-related API errors
export function handleSubscriptionError(error: Error) {
  const message = error.message;
  
  // Check for trial expiration error
  if (message.includes('TRIAL_EXPIRED') || message.includes('trial has expired')) {
    // Redirect to trial expired page
    window.location.href = '/trial-expired';
    return true; // Handled
  }
  
  // Check for general subscription required error
  if (message.includes('SUBSCRIPTION_REQUIRED') || message.includes('subscription required')) {
    // Redirect to trial expired page (handles both cases)
    window.location.href = '/trial-expired';
    return true; // Handled
  }
  
  return false; // Not handled
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