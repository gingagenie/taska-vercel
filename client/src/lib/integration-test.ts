/**
 * Integration Testing for Hybrid Authentication System
 * 
 * This module provides comprehensive testing to verify that the hybrid
 * authentication system works correctly and ensures zero impact on
 * existing web/Android users.
 */

import { 
  detectPlatform, 
  shouldUseTokenAuth, 
  getAuthMode, 
  getPlatformDescription,
  isCookieModeForced 
} from './platform-detection';

import { 
  getAuthDebugInfo, 
  validateAuthConfiguration, 
  isJWTAuthDisabled 
} from './auth-debug';

export interface IntegrationTestResults {
  platformDetection: {
    passed: boolean;
    platform: string;
    authMode: string;
    description: string;
    issues: string[];
  };
  killSwitch: {
    passed: boolean;
    isForced: boolean;
    isJWTDisabled: boolean;
    issues: string[];
  };
  authConfiguration: {
    passed: boolean;
    isValid: boolean;
    warnings: string[];
    errors: string[];
  };
  webCompatibility: {
    passed: boolean;
    usesCookies: boolean;
    issues: string[];
  };
  debugging: {
    passed: boolean;
    debugSystemAvailable: boolean;
    issues: string[];
  };
  overall: {
    passed: boolean;
    score: number;
    summary: string;
  };
}

/**
 * Run comprehensive integration tests for the hybrid auth system
 */
export async function runIntegrationTests(): Promise<IntegrationTestResults> {
  console.group('🧪 HYBRID AUTH INTEGRATION TESTS');
  
  const results: IntegrationTestResults = {
    platformDetection: await testPlatformDetection(),
    killSwitch: await testKillSwitch(),
    authConfiguration: await testAuthConfiguration(),
    webCompatibility: await testWebCompatibility(),
    debugging: await testDebugSystem(),
    overall: { passed: false, score: 0, summary: '' }
  };

  // Calculate overall score
  const tests = [
    results.platformDetection,
    results.killSwitch,
    results.authConfiguration,
    results.webCompatibility,
    results.debugging
  ];
  
  const passedTests = tests.filter(test => test.passed).length;
  const totalTests = tests.length;
  const score = Math.round((passedTests / totalTests) * 100);
  
  results.overall = {
    passed: score >= 90, // 90% pass rate required
    score,
    summary: `${passedTests}/${totalTests} tests passed (${score}%)`
  };

  console.log('🎯 Overall Results:', results.overall);
  console.groupEnd();

  return results;
}

/**
 * Test platform detection functionality
 */
async function testPlatformDetection(): Promise<any> {
  console.log('🔍 Testing platform detection...');
  
  const issues: string[] = [];
  let passed = true;
  
  try {
    const platform = detectPlatform();
    const shouldUseToken = shouldUseTokenAuth();
    const authMode = getAuthMode();
    const description = getPlatformDescription();
    
    // Verify platform is detected
    if (!platform.platform) {
      issues.push('Platform not detected');
      passed = false;
    }
    
    // Verify auth mode consistency
    if (authMode !== platform.authMode) {
      issues.push('Auth mode inconsistency between functions');
      passed = false;
    }
    
    // Verify web platform uses cookies
    if (platform.platform === 'web' && shouldUseToken) {
      issues.push('Web platform should not use tokens');
      passed = false;
    }
    
    console.log('✅ Platform detection test completed');
    
    return {
      passed,
      platform: platform.platform,
      authMode,
      description,
      issues
    };
  } catch (error) {
    console.error('❌ Platform detection test failed:', error);
    return {
      passed: false,
      platform: 'unknown',
      authMode: 'unknown',
      description: 'Test failed',
      issues: [`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Test kill switch functionality
 */
async function testKillSwitch(): Promise<any> {
  console.log('🔴 Testing kill switch functionality...');
  
  const issues: string[] = [];
  let passed = true;
  
  try {
    const isForced = isCookieModeForced();
    const isJWTDisabled = isJWTAuthDisabled();
    
    // Test that kill switch affects auth mode
    const shouldUseToken = shouldUseTokenAuth();
    if (isForced && shouldUseToken) {
      issues.push('Kill switch not preventing token auth');
      passed = false;
    }
    
    console.log('✅ Kill switch test completed');
    
    return {
      passed,
      isForced,
      isJWTDisabled,
      issues
    };
  } catch (error) {
    console.error('❌ Kill switch test failed:', error);
    return {
      passed: false,
      isForced: false,
      isJWTDisabled: false,
      issues: [`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Test auth configuration validation
 */
async function testAuthConfiguration(): Promise<any> {
  console.log('⚙️ Testing auth configuration...');
  
  try {
    const validation = await validateAuthConfiguration();
    
    console.log('✅ Auth configuration test completed');
    
    return {
      passed: validation.isValid,
      isValid: validation.isValid,
      warnings: validation.warnings,
      errors: validation.errors
    };
  } catch (error) {
    console.error('❌ Auth configuration test failed:', error);
    return {
      passed: false,
      isValid: false,
      warnings: [],
      errors: [`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Test web browser compatibility (zero impact requirement)
 */
async function testWebCompatibility(): Promise<any> {
  console.log('🌐 Testing web compatibility...');
  
  const issues: string[] = [];
  let passed = true;
  
  try {
    const platform = detectPlatform();
    const shouldUseToken = shouldUseTokenAuth();
    
    // Critical: Web browsers must use cookies
    const usesCookies = platform.platform === 'web' && !shouldUseToken;
    
    if (platform.platform === 'web' && shouldUseToken) {
      issues.push('Web platform is using tokens - violates zero impact requirement');
      passed = false;
    }
    
    if (platform.platform === 'android' && shouldUseToken) {
      issues.push('Android platform is using tokens - violates zero impact requirement');
      passed = false;
    }
    
    console.log('✅ Web compatibility test completed');
    
    return {
      passed,
      usesCookies,
      issues
    };
  } catch (error) {
    console.error('❌ Web compatibility test failed:', error);
    return {
      passed: false,
      usesCookies: false,
      issues: [`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Test debug system functionality
 */
async function testDebugSystem(): Promise<any> {
  console.log('🛠️ Testing debug system...');
  
  const issues: string[] = [];
  let passed = true;
  
  try {
    const debugInfo = await getAuthDebugInfo();
    const debugSystemAvailable = !!(debugInfo && typeof debugInfo === 'object');
    
    if (!debugSystemAvailable) {
      issues.push('Debug system not available');
      passed = false;
    }
    
    // Check if global debug functions are available
    const globalDebugAvailable = typeof window !== 'undefined' && !!(window as any).authDebug;
    if (!globalDebugAvailable) {
      issues.push('Global debug functions not available');
      // This is a warning, not a failure
    }
    
    console.log('✅ Debug system test completed');
    
    return {
      passed,
      debugSystemAvailable,
      issues
    };
  } catch (error) {
    console.error('❌ Debug system test failed:', error);
    return {
      passed: false,
      debugSystemAvailable: false,
      issues: [`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Generate integration test report
 */
export function generateTestReport(results: IntegrationTestResults): string {
  const { overall, platformDetection, killSwitch, authConfiguration, webCompatibility, debugging } = results;
  
  let report = `
# Hybrid Authentication System Integration Test Report

## Overall Results: ${overall.passed ? '✅ PASSED' : '❌ FAILED'}
**Score:** ${overall.score}% (${overall.summary})

## Test Results

### 1. Platform Detection ${platformDetection.passed ? '✅' : '❌'}
- **Platform:** ${platformDetection.platform}
- **Auth Mode:** ${platformDetection.authMode}
- **Description:** ${platformDetection.description}
${platformDetection.issues.length > 0 ? `- **Issues:** ${platformDetection.issues.join(', ')}` : ''}

### 2. Kill Switch ${killSwitch.passed ? '✅' : '❌'}
- **Cookie Mode Forced:** ${killSwitch.isForced ? 'Yes' : 'No'}
- **JWT Disabled:** ${killSwitch.isJWTDisabled ? 'Yes' : 'No'}
${killSwitch.issues.length > 0 ? `- **Issues:** ${killSwitch.issues.join(', ')}` : ''}

### 3. Auth Configuration ${authConfiguration.passed ? '✅' : '❌'}
- **Valid:** ${authConfiguration.isValid ? 'Yes' : 'No'}
- **Warnings:** ${authConfiguration.warnings.length}
- **Errors:** ${authConfiguration.errors.length}
${authConfiguration.errors.length > 0 ? `- **Error Details:** ${authConfiguration.errors.join(', ')}` : ''}

### 4. Web Compatibility ${webCompatibility.passed ? '✅' : '❌'}
- **Uses Cookies:** ${webCompatibility.usesCookies ? 'Yes' : 'No'}
- **Zero Impact Maintained:** ${webCompatibility.passed ? 'Yes' : 'No'}
${webCompatibility.issues.length > 0 ? `- **Issues:** ${webCompatibility.issues.join(', ')}` : ''}

### 5. Debug System ${debugging.passed ? '✅' : '❌'}
- **Debug System Available:** ${debugging.debugSystemAvailable ? 'Yes' : 'No'}
${debugging.issues.length > 0 ? `- **Issues:** ${debugging.issues.join(', ')}` : ''}

## Recommendations

${overall.passed 
  ? '🎉 All critical tests passed! The hybrid authentication system is ready for deployment.'
  : '⚠️ Some tests failed. Please review the issues above before deploying.'}

- **Kill Switch Status:** ${killSwitch.isForced ? 'ACTIVE (Cookie mode enforced)' : 'INACTIVE (Normal operation)'}
- **iOS Compatibility:** ${platformDetection.platform === 'ios' ? 'Configured for JWT tokens' : 'N/A (not iOS)'}
- **Web/Android Safety:** ${webCompatibility.passed ? 'Protected (using cookies)' : 'At risk - check configuration'}

## Debug Commands

Run the following in the browser console for detailed debugging:
\`\`\`javascript
// Get comprehensive auth info
window.authDebug.getInfo()

// Run diagnostics
window.authDebug.logDiagnostics()

// Validate configuration
window.authDebug.validate()

// Check effective auth mode
window.authDebug.getEffectiveMode()
\`\`\`
`;

  return report.trim();
}

// Auto-run integration tests in development
if (import.meta.env.DEV) {
  // Run tests after a short delay to allow app to initialize
  setTimeout(async () => {
    try {
      console.log('🚀 Running automatic integration tests...');
      const results = await runIntegrationTests();
      const report = generateTestReport(results);
      console.log(report);
      
      // Store results for later access
      if (typeof window !== 'undefined') {
        (window as any).authTestResults = results;
        console.log('💾 Test results available at window.authTestResults');
      }
    } catch (error) {
      console.error('🔥 Integration tests failed to run:', error);
    }
  }, 2000);
}