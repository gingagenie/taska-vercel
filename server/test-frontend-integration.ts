// Test frontend TikTok integration endpoints
import { apiRequest } from '../client/src/lib/queryClient';

async function testFrontendIntegration() {
  console.log('🌐 Testing Frontend TikTok Integration...\n');

  const testEvents = [
    {
      name: 'ViewContent Test',
      payload: {
        eventType: 'ViewContent',
        contentData: {
          contentId: 'home-page',
          contentType: 'page',
          contentName: 'Taska Home Page',
          contentCategory: 'marketing',
          value: 0,
          currency: 'AUD'
        },
        pageUrl: 'https://taska.example.com/',
        customerInfo: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '0412345678',
          city: 'Melbourne',
          state: 'VIC',
          country: 'AU',
          zipCode: '3000'
        }
      }
    },
    {
      name: 'Lead Test',
      payload: {
        eventType: 'Lead',
        contentData: {
          value: 250,
          currency: 'AUD',
          contentName: 'Contact Form',
          contentCategory: 'lead',
          description: 'Customer inquiry form submission'
        },
        pageUrl: 'https://taska.example.com/contact',
        customerInfo: {
          firstName: 'Sarah',
          lastName: 'Wilson',
          phone: '0423456789',
          city: 'Sydney',
          state: 'NSW',
          country: 'AU'
        }
      }
    },
    {
      name: 'ClickButton Test',
      payload: {
        eventType: 'ClickButton',
        contentData: {
          contentName: 'Get Quote CTA',
          contentCategory: 'button_click',
          description: 'Main call-to-action button clicked'
        },
        pageUrl: 'https://taska.example.com/services',
        customerInfo: {
          firstName: 'Mike',
          lastName: 'Johnson',
          phone: '0434567890'
        }
      }
    }
  ];

  for (const test of testEvents) {
    console.log(`🧪 Testing: ${test.name}`);
    
    try {
      const startTime = Date.now();
      
      const response = await fetch('http://localhost:5000/api/tiktok/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'test-user-frontend',
          'x-org-id': 'test-org-frontend'
        },
        body: JSON.stringify(test.payload)
      });

      const responseTime = Date.now() - startTime;
      const result = await response.json();

      console.log(`  ⏱️  Response time: ${responseTime}ms`);
      console.log(`  📊 Status: ${response.status}`);
      console.log(`  📋 Result:`, result);

      if (result.success) {
        console.log(`  ✅ ${test.name} - SUCCESS`);
      } else {
        console.log(`  ⚠️  ${test.name} - FAILED: ${result.error}`);
      }

    } catch (error) {
      console.log(`  ❌ ${test.name} - ERROR:`, error);
    }
    
    console.log(''); // Empty line for readability
  }

  console.log('🏁 Frontend integration testing complete\n');
}

async function testErrorHandling() {
  console.log('🛡️  Testing Error Handling...\n');

  const errorTests = [
    {
      name: 'Missing eventType',
      payload: {
        contentData: { contentName: 'Test' },
        customerInfo: { firstName: 'Test' }
      }
    },
    {
      name: 'Invalid eventType',
      payload: {
        eventType: 'InvalidEvent',
        contentData: { contentName: 'Test' },
        customerInfo: { firstName: 'Test' }
      }
    },
    {
      name: 'Empty payload',
      payload: {}
    }
  ];

  for (const test of errorTests) {
    console.log(`🧪 Testing: ${test.name}`);
    
    try {
      const response = await fetch('http://localhost:5000/api/tiktok/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'test-user-error',
          'x-org-id': 'test-org-error'
        },
        body: JSON.stringify(test.payload)
      });

      const result = await response.json();
      console.log(`  📊 Status: ${response.status}`);
      console.log(`  📋 Result:`, result);

      if (response.status === 400 || response.status === 500) {
        console.log(`  ✅ ${test.name} - Properly handled error`);
      } else {
        console.log(`  ⚠️  ${test.name} - Unexpected response`);
      }

    } catch (error) {
      console.log(`  ❌ ${test.name} - Network error:`, error);
    }
    
    console.log('');
  }

  console.log('🏁 Error handling testing complete');
}

async function runAllTests() {
  await testFrontendIntegration();
  await testErrorHandling();
}

runAllTests().catch(console.error);