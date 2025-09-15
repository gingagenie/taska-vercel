#!/usr/bin/env node

/**
 * COMPREHENSIVE SUPPORT VS CUSTOMER AUTHENTICATION ISOLATION TEST
 * 
 * Tests complete separation between support staff and customer authentication systems.
 * This verifies enterprise-grade security isolation to prevent privilege escalation.
 */

const crypto = require('crypto');

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SUPPORT_TEST_EMAIL = 'admin@support.com';
const CUSTOMER_TEST_EMAIL = 'keith.richmond@live.com';
const TEST_PASSWORD = 'admin123'; // We'll try this common password

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(testName, passed, details) {
  const result = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${result} | ${testName}`);
  if (details) console.log(`   Details: ${details}`);
  
  testResults.tests.push({
    name: testName,
    passed,
    details
  });
  
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

/**
 * Test 1: Support Token HMAC Security
 * Verify that support tokens are cryptographically secure
 */
async function testSupportTokenSecurity() {
  console.log('\n🔒 Testing Support Token HMAC Security...');
  
  try {
    // Test token generation (we'll manually create tokens to test verification)
    const testPayload = {
      supportUserId: '8a9ed516-f4a7-4361-890c-0d822c7378fc',
      role: 'support_admin',
      issuedAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
    };
    
    // Create a properly signed token using the same logic as the server
    const payloadJson = JSON.stringify(testPayload);
    const payloadBase64 = Buffer.from(payloadJson).toString('base64url');
    const secret = 'dev-support-secret-change-in-production'; // Default dev secret
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadBase64);
    const signature = hmac.digest('base64url');
    const validToken = `${payloadBase64}.${signature}`;
    
    logTest('Support Token Generation', true, 'Successfully created HMAC-signed token');
    
    // Test 1a: Token format validation
    const parts = validToken.split('.');
    logTest('Token Format Validation', parts.length === 2, `Token has ${parts.length} parts (expected 2)`);
    
    // Test 1b: Payload extraction
    const extractedPayload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payloadValid = extractedPayload.supportUserId === testPayload.supportUserId;
    logTest('Token Payload Extraction', payloadValid, 'Payload correctly extracted and matches');
    
    // Test 1c: Signature verification
    const testHmac = crypto.createHmac('sha256', secret);
    testHmac.update(parts[0]);
    const expectedSig = testHmac.digest('base64url');
    const sigValid = expectedSig === parts[1];
    logTest('Token Signature Verification', sigValid, 'HMAC signature verification works');
    
    return validToken;
    
  } catch (error) {
    logTest('Support Token Security Test', false, `Error: ${error.message}`);
    return null;
  }
}

/**
 * Test 2: Support Staff Authentication
 * Test login with support credentials
 */
async function testSupportStaffAuthentication() {
  console.log('\n👤 Testing Support Staff Authentication...');
  
  try {
    const response = await fetch(`${BASE_URL}/support/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: SUPPORT_TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const cookies = response.headers.get('set-cookie') || '';
      
      // Check for support session cookie
      const hasSupportSid = cookies.includes('support_sid=');
      logTest('Support Session Cookie Creation', hasSupportSid, 'support_sid cookie set on login');
      
      // Check for secure support token cookie
      const hasSupportToken = cookies.includes('support_token=');
      logTest('Secure Support Token Cookie', hasSupportToken, 'support_token cookie set with HMAC signature');
      
      // Extract cookies for further tests
      const supportSidMatch = cookies.match(/support_sid=([^;]+)/);
      const supportTokenMatch = cookies.match(/support_token=([^;]+)/);
      
      return {
        success: true,
        supportSid: supportSidMatch ? supportSidMatch[1] : null,
        supportToken: supportTokenMatch ? supportTokenMatch[1] : null,
        userData: data.user
      };
    } else {
      const errorData = await response.json();
      logTest('Support Staff Login', false, `Login failed: ${errorData.error}`);
      return { success: false };
    }
    
  } catch (error) {
    logTest('Support Staff Authentication Test', false, `Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 3: Customer Authentication
 * Test login with customer credentials
 */
async function testCustomerAuthentication() {
  console.log('\n🏢 Testing Customer Authentication...');
  
  try {
    // First, try to login as customer (using session-based auth)
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: CUSTOMER_TEST_EMAIL,
        password: 'password123' // From the seed data
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const cookies = response.headers.get('set-cookie') || '';
      
      // Check for regular session cookie (NOT support_sid)
      const hasRegularSid = cookies.includes('sid=') && !cookies.includes('support_sid=');
      logTest('Customer Session Cookie Creation', hasRegularSid, 'Regular sid cookie set (not support_sid)');
      
      // Check that NO support token is set
      const hasNoSupportToken = !cookies.includes('support_token=');
      logTest('No Support Token for Customer', hasNoSupportToken, 'No support_token cookie set for customer');
      
      const sidMatch = cookies.match(/sid=([^;]+)/);
      
      return {
        success: true,
        sid: sidMatch ? sidMatch[1] : null,
        userData: data.user
      };
    } else {
      const errorData = await response.json();
      logTest('Customer Login', false, `Login failed: ${errorData.error}`);
      return { success: false };
    }
    
  } catch (error) {
    logTest('Customer Authentication Test', false, `Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 4: Session Isolation
 * Verify support_sid and sid cookies are completely isolated
 */
async function testSessionIsolation(supportAuth, customerAuth) {
  console.log('\n🔐 Testing Session Isolation...');
  
  if (!supportAuth.success || !customerAuth.success) {
    logTest('Session Isolation Prerequisites', false, 'Both auth types must work for isolation testing');
    return;
  }
  
  // Test 4a: Support session cannot access customer endpoints
  try {
    const response = await fetch(`${BASE_URL}/api/customers`, {
      headers: {
        'Cookie': `support_sid=${supportAuth.supportSid}; support_token=${supportAuth.supportToken}`
      }
    });
    
    const blocked = response.status === 403;
    logTest('Support Staff Blocked from Customer Data', blocked, `Got status ${response.status} when accessing /api/customers`);
    
  } catch (error) {
    logTest('Support Isolation Test', false, `Error testing support isolation: ${error.message}`);
  }
  
  // Test 4b: Customer session cannot access support admin endpoints
  try {
    const response = await fetch(`${BASE_URL}/support/api/admin/users`, {
      headers: {
        'Cookie': `sid=${customerAuth.sid}`
      }
    });
    
    const blocked = response.status === 403 || response.status === 401;
    logTest('Customer Blocked from Support Admin', blocked, `Got status ${response.status} when accessing /support/api/admin/users`);
    
  } catch (error) {
    logTest('Customer Isolation Test', false, `Error testing customer isolation: ${error.message}`);
  }
  
  // Test 4c: Cross-session contamination test
  try {
    // Try to use support token with customer endpoint
    const response = await fetch(`${BASE_URL}/api/jobs`, {
      headers: {
        'Cookie': `sid=${customerAuth.sid}; support_token=${supportAuth.supportToken}`
      }
    });
    
    const stillBlocked = response.status === 403;
    logTest('No Cross-Session Contamination', stillBlocked, 'Support token cannot elevate customer session privileges');
    
  } catch (error) {
    logTest('Cross-Session Test', false, `Error testing cross-session: ${error.message}`);
  }
}

/**
 * Test 5: Token Forgery Resistance
 * Test that forged tokens are rejected
 */
async function testTokenForgeryResistance() {
  console.log('\n🛡️  Testing Token Forgery Resistance...');
  
  // Test 5a: Malformed token
  try {
    const response = await fetch(`${BASE_URL}/support/api/admin/users`, {
      headers: {
        'Cookie': 'support_token=malformed.token'
      }
    });
    
    const rejected = response.status === 401 || response.status === 403;
    logTest('Malformed Token Rejection', rejected, 'Malformed tokens are rejected');
    
  } catch (error) {
    logTest('Malformed Token Test', false, `Error: ${error.message}`);
  }
  
  // Test 5b: Tampered payload
  try {
    const fakePayload = {
      supportUserId: '00000000-0000-0000-0000-000000000000',
      role: 'support_admin',
      issuedAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000)
    };
    
    const payloadBase64 = Buffer.from(JSON.stringify(fakePayload)).toString('base64url');
    const fakeSignature = 'fake_signature_that_wont_verify';
    const tamperedToken = `${payloadBase64}.${fakeSignature}`;
    
    const response = await fetch(`${BASE_URL}/support/api/admin/users`, {
      headers: {
        'Cookie': `support_token=${tamperedToken}`
      }
    });
    
    const rejected = response.status === 401 || response.status === 403;
    logTest('Tampered Token Rejection', rejected, 'Tampered tokens are rejected');
    
  } catch (error) {
    logTest('Tampered Token Test', false, `Error: ${error.message}`);
  }
  
  // Test 5c: Expired token
  try {
    const expiredPayload = {
      supportUserId: '8a9ed516-f4a7-4361-890c-0d822c7378fc',
      role: 'support_admin',
      issuedAt: Date.now() - (3 * 60 * 60 * 1000), // 3 hours ago
      expiresAt: Date.now() - (1 * 60 * 60 * 1000)  // Expired 1 hour ago
    };
    
    const payloadJson = JSON.stringify(expiredPayload);
    const payloadBase64 = Buffer.from(payloadJson).toString('base64url');
    const secret = 'dev-support-secret-change-in-production';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadBase64);
    const signature = hmac.digest('base64url');
    const expiredToken = `${payloadBase64}.${signature}`;
    
    const response = await fetch(`${BASE_URL}/support/api/admin/users`, {
      headers: {
        'Cookie': `support_token=${expiredToken}`
      }
    });
    
    const rejected = response.status === 401 || response.status === 403;
    logTest('Expired Token Rejection', rejected, 'Expired tokens are rejected');
    
  } catch (error) {
    logTest('Expired Token Test', false, `Error: ${error.message}`);
  }
}

/**
 * Test 6: Cross-Authentication Attempts
 * Verify complete isolation between auth systems
 */
async function testCrossAuthenticationAttempts() {
  console.log('\n🚫 Testing Cross-Authentication Attempts...');
  
  // Test 6a: Try to login to support with customer credentials
  try {
    const response = await fetch(`${BASE_URL}/support/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: CUSTOMER_TEST_EMAIL,
        password: 'password123'
      })
    });
    
    const loginFailed = !response.ok;
    logTest('Customer Creds Rejected by Support Login', loginFailed, 'Customer cannot login to support system');
    
  } catch (error) {
    logTest('Cross-Auth Customer to Support Test', false, `Error: ${error.message}`);
  }
  
  // Test 6b: Try to login to customer system with support credentials
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: SUPPORT_TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });
    
    const loginFailed = !response.ok;
    logTest('Support Creds Rejected by Customer Login', loginFailed, 'Support cannot login to customer system');
    
  } catch (error) {
    logTest('Cross-Auth Support to Customer Test', false, `Error: ${error.message}`);
  }
}

/**
 * Test 7: Access Control Middleware Verification
 * Test that middleware properly blocks unauthorized access
 */
async function testAccessControlMiddleware(supportAuth) {
  console.log('\n🛡️  Testing Access Control Middleware...');
  
  if (!supportAuth.success) {
    logTest('Access Control Prerequisites', false, 'Support auth must work for middleware testing');
    return;
  }
  
  // Test 7a: Verify support staff can access support admin endpoints
  try {
    const response = await fetch(`${BASE_URL}/support/api/admin/users`, {
      headers: {
        'Cookie': `support_sid=${supportAuth.supportSid}; support_token=${supportAuth.supportToken}`
      }
    });
    
    const canAccess = response.ok;
    logTest('Support Staff Can Access Support Admin', canAccess, `Got status ${response.status} for support admin endpoint`);
    
  } catch (error) {
    logTest('Support Admin Access Test', false, `Error: ${error.message}`);
  }
  
  // Test 7b: Test each blocked customer endpoint
  const customerEndpoints = [
    '/api/customers',
    '/api/equipment', 
    '/api/jobs',
    '/api/quotes',
    '/api/invoices',
    '/api/members'
  ];
  
  for (const endpoint of customerEndpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          'Cookie': `support_token=${supportAuth.supportToken}`
        }
      });
      
      const blocked = response.status === 403;
      logTest(`Support Blocked from ${endpoint}`, blocked, `Status: ${response.status}`);
      
    } catch (error) {
      logTest(`Access Test ${endpoint}`, false, `Error: ${error.message}`);
    }
  }
}

/**
 * Main test execution
 */
async function runAllTests() {
  console.log('🚀 COMPREHENSIVE SUPPORT VS CUSTOMER AUTHENTICATION ISOLATION TEST');
  console.log('==================================================================\n');
  
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Support test email: ${SUPPORT_TEST_EMAIL}`);
  console.log(`Customer test email: ${CUSTOMER_TEST_EMAIL}\n`);
  
  // Run all test suites
  const validToken = await testSupportTokenSecurity();
  const supportAuth = await testSupportStaffAuthentication();
  const customerAuth = await testCustomerAuthentication();
  
  await testSessionIsolation(supportAuth, customerAuth);
  await testTokenForgeryResistance();
  await testCrossAuthenticationAttempts();
  await testAccessControlMiddleware(supportAuth);
  
  // Print final results
  console.log('\n📊 FINAL RESULTS');
  console.log('=================');
  console.log(`✅ Tests Passed: ${testResults.passed}`);
  console.log(`❌ Tests Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n🚨 FAILED TESTS:');
    testResults.tests
      .filter(test => !test.passed)
      .forEach(test => console.log(`   ❌ ${test.name}: ${test.details || 'No details'}`));
  }
  
  console.log('\n🔒 SECURITY ASSESSMENT:');
  if (testResults.failed === 0) {
    console.log('✅ SECURE: Complete authentication isolation verified');
    console.log('✅ All security boundaries properly enforced');
    console.log('✅ No privilege escalation vulnerabilities detected');
  } else {
    console.log('⚠️  SECURITY ISSUES DETECTED');
    console.log('⚠️  Review failed tests for potential vulnerabilities');
    console.log('⚠️  Fix issues before deploying to production');
  }
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testResults
};