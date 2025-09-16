// Minimal TikTok API test to isolate the issue
const TIKTOK_API_ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const TIKTOK_PIXEL_ID = 'D34FV3JC77U1PDQ72P1G';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;

async function testMinimalPayload() {
  console.log('🧪 Testing minimal TikTok API payload...');
  
  const minimalPayload = {
    pixel_code: TIKTOK_PIXEL_ID,
    event_source_id: TIKTOK_PIXEL_ID,
    data: [{
      event: 'ViewContent',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `test_${Date.now()}`,
      event_source: 'web',
      user: {
        email: 'test@example.com' // Not hashed for debugging
      }
    }]
  };

  console.log('📤 Sending payload:');
  console.log(JSON.stringify(minimalPayload, null, 2));

  try {
    const response = await fetch(TIKTOK_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Access-Token': TIKTOK_ACCESS_TOKEN!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(minimalPayload),
    });

    const responseData = await response.json();
    
    console.log('\n📥 Response:');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(responseData, null, 2));

    if (response.ok && responseData.code === 0) {
      console.log('✅ SUCCESS: Minimal payload works!');
    } else {
      console.log('❌ FAILED: API error');
      console.log('Error details:', responseData.message);
    }

  } catch (error) {
    console.error('❌ Network error:', error);
  }
}

testMinimalPayload();