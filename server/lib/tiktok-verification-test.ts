/**
 * TikTok Events Service Security Verification Test
 * This file verifies that PII is properly hashed before transmission
 */

import { tiktokEvents } from '../services/tiktok-events';
import crypto from 'crypto';

// Test hash function matches expected SHA-256 output
function testHashFunction() {
  const testEmail = 'test@example.com';
  const expectedHash = crypto.createHash('sha256').update(testEmail.toLowerCase().trim()).digest('hex');
  
  // Access the private method through any casting (for testing only)
  const actualHash = (tiktokEvents as any).hashPII(testEmail);
  
  if (actualHash === expectedHash) {
    console.log('✅ HASH VERIFICATION PASSED: Email hashing works correctly');
    return true;
  } else {
    console.error('❌ HASH VERIFICATION FAILED: Hash mismatch');
    console.error('Expected:', expectedHash);
    console.error('Actual:  ', actualHash);
    return false;
  }
}

// Verify hash output looks like SHA-256 (64 hex characters)
function testHashFormat() {
  const testData = 'sample@email.com';
  const hash = (tiktokEvents as any).hashPII(testData);
  
  if (/^[a-f0-9]{64}$/.test(hash)) {
    console.log('✅ HASH FORMAT VERIFICATION PASSED: Output is valid SHA-256 format');
    return true;
  } else {
    console.error('❌ HASH FORMAT VERIFICATION FAILED: Invalid hash format');
    console.error('Hash:', hash);
    return false;
  }
}

// Verify phone normalization and hashing
function testPhoneProcessing() {
  const testPhone = '0412345678'; // Australian mobile
  const normalizedPhone = (tiktokEvents as any).normalizePhoneNumber(testPhone);
  const hashedPhone = (tiktokEvents as any).hashPII(normalizedPhone);
  
  if (normalizedPhone === '+61412345678' && /^[a-f0-9]{64}$/.test(hashedPhone)) {
    console.log('✅ PHONE PROCESSING VERIFICATION PASSED: Phone normalized and hashed correctly');
    return true;
  } else {
    console.error('❌ PHONE PROCESSING VERIFICATION FAILED');
    console.error('Normalized:', normalizedPhone);
    console.error('Hash:', hashedPhone);
    return false;
  }
}

// Main verification function
export function runTikTokSecurityVerification(): boolean {
  console.log('🔐 Running TikTok Events Service Security Verification...\n');
  
  const results = [
    testHashFunction(),
    testHashFormat(), 
    testPhoneProcessing()
  ];
  
  const allPassed = results.every(result => result);
  
  if (allPassed) {
    console.log('\n✅ ALL VERIFICATION TESTS PASSED');
    console.log('🔒 PII hashing is working correctly - secure for production');
    return true;
  } else {
    console.error('\n❌ VERIFICATION FAILED');
    console.error('🚨 SECURITY ISSUE: PII hashing verification failed');
    return false;
  }
}

// Auto-run verification if file is executed directly
if (require.main === module) {
  runTikTokSecurityVerification();
}