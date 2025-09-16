import { tiktokEvents } from './services/tiktok-events';

// Debug test to see the exact payload being sent
async function debugTikTokPayload() {
  console.log('🔍 DEBUGGING TikTok Payload Structure');
  
  const customerInfo = {
    firstName: 'Test',
    lastName: 'User',
    phone: '0400000000',
    email: 'test@example.com',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    city: 'Melbourne',
    state: 'VIC',
    country: 'AU',
  };

  const contentData = {
    contentId: 'debug-test',
    contentType: 'page',
    contentName: 'Debug Test Page',
    contentCategory: 'test',
    value: 0,
    currency: 'AUD',
  };

  console.log('\n📋 Customer Info:', customerInfo);
  console.log('\n📋 Content Data:', contentData);

  // Access the private method for testing
  const payload = (tiktokEvents as any).createBasePayload(
    'ViewContent',
    customerInfo,
    contentData,
    'https://test.com',
    'https://referrer.com'
  );

  console.log('\n📦 Generated Payload:');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n🔍 Payload Analysis:');
  console.log('- pixel_code:', payload.pixel_code);
  console.log('- event_source_id:', payload.event_source_id);
  console.log('- data array length:', payload.data?.length || 0);
  
  if (payload.data && payload.data.length > 0) {
    const eventData = payload.data[0];
    console.log('- event:', eventData.event);
    console.log('- event_time:', eventData.event_time, '(Unix timestamp)');
    console.log('- event_id:', eventData.event_id);
    console.log('- event_source:', eventData.event_source);
    console.log('- user fields:', Object.keys(eventData.user || {}));
    console.log('- properties fields:', Object.keys(eventData.properties || {}));
  }

  console.log('\n✅ Debug analysis complete');
}

// Run the debug test
debugTikTokPayload().catch(console.error);