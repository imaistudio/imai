#!/usr/bin/env node

/**
 * Enhanced Smoke Test with Queue Testing for IMAI API Routes
 * Tests rate limiting, queuing, and all major endpoints
 * 
 * Run with: node scripts/smoke-test.js
 */

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Test image and video URLs for testing
const TEST_IMAGE_URL = 'https://picsum.photos/400/300';
const TEST_VIDEO_URL = 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4';

// Comprehensive test cases categorized by service
const testCases = [
  // ==================== ANTHROPIC ROUTES ====================
  {
    name: 'Prompt Enhancer (Anthropic)',
    endpoint: '/api/promptenhancer',
    service: 'anthropic',
    priority: 1,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('prompt', 'make this image more vibrant and colorful');
      formData.append('enhancement_type', 'design');
    }
  },
  {
    name: 'Intent Route (Anthropic)', 
    endpoint: '/api/intentroute',
    service: 'anthropic',
    priority: 2,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('message', 'upscale my image');
      formData.append('chatId', 'smoke-test-chat');
    }
  },
  {
    name: 'Kling Video Generation (Anthropic)',
    endpoint: '/api/kling', 
    service: 'anthropic',
    priority: 3,
    method: 'POST',
    isJSON: true,
    jsonBody: {
      image: TEST_IMAGE_URL
    }
  },

  // ==================== OPENAI ROUTES ====================
  {
    name: 'Image Analysis (OpenAI)',
    endpoint: '/api/analyzeimage',
    service: 'openai', 
    priority: 1,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
    }
  },
  {
    name: 'Design Composition (OpenAI)',
    endpoint: '/api/design',
    service: 'openai',
    priority: 2,
    method: 'POST', 
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('prompt', 'a modern minimalist design');
      formData.append('workflow', 'prompt_only');
      formData.append('size', '1024x1024');
      formData.append('quality', 'standard');
    }
  },
  {
    name: 'Mirror Magic (OpenAI/Anthropic)',
    endpoint: '/api/mirrormagic',
    service: 'mixed',
    priority: 3,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('prompt', 'create artistic mirror effects');
    }
  },

  // ==================== FAL AI ROUTES ====================
  {
    name: 'Image Upscale (FAL AI)',
    endpoint: '/api/upscale',
    service: 'fal',
    priority: 1,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('upscaling_factor', '2');
      formData.append('overlapping_tiles', 'false');
    }
  },
  {
    name: 'Clarity Upscaler (FAL AI)',
    endpoint: '/api/clarityupscaler',
    service: 'fal',
    priority: 2,
    method: 'POST',
    isJSON: true,
    jsonBody: {
      imageUrl: TEST_IMAGE_URL,
      prompt: 'high quality, detailed',
      upscaleFactor: 2,
      guidanceScale: 4
    }
  },
  {
    name: 'Chain of Zoom (FAL AI)',
    endpoint: '/api/chainofzoom',
    service: 'fal',
    priority: 2,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('scale', '3');
      formData.append('center_x', '0.5');
      formData.append('center_y', '0.5');
    }
  },
  {
    name: 'Scene Composition (FAL AI)',
    endpoint: '/api/scenecomposition',
    service: 'fal',
    priority: 2,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('prompt', 'beautiful forest scene');
      formData.append('guidance_scale', '3.5');
    }
  },
  {
    name: 'Time of Day (FAL AI)',
    endpoint: '/api/timeofday',
    service: 'fal',
    priority: 2,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('prompt', 'golden hour lighting');
      formData.append('guidance_scale', '3.5');
    }
  },
  {
    name: 'Object Removal (FAL AI)',
    endpoint: '/api/objectremoval',
    service: 'fal',
    priority: 2,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('prompt', 'remove unwanted objects');
      formData.append('guidance_scale', '3.5');
    }
  },
  {
    name: 'Video Upscaler (FAL AI)',
    endpoint: '/api/videoupscaler',
    service: 'fal',
    priority: 3,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('video_url', TEST_VIDEO_URL);
    }
  },
  {
    name: 'Video Reframe (FAL AI)',
    endpoint: '/api/videoreframe',
    service: 'fal',
    priority: 3,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('video_url', TEST_VIDEO_URL);
      formData.append('prompt', 'cinematic reframing');
      formData.append('aspect_ratio', '16:9');
      formData.append('resolution', '1080p');
    }
  },
  {
    name: 'Seed Dance Video (FAL AI)',
    endpoint: '/api/seedancevideo',
    service: 'fal',
    priority: 3,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('userid', 'test-user-smoke');
      formData.append('image_url', TEST_IMAGE_URL);
      formData.append('prompt', 'dancing motion');
      formData.append('duration', '5');
    }
  },

  // ==================== UTILITY/OTHER ROUTES ====================
  {
    name: 'Download Image',
    endpoint: '/api/download-image',
    service: 'utility',
    priority: 4,
    method: 'POST',
    setupFormData: (formData) => {
      formData.append('imageUrl', TEST_IMAGE_URL);
      formData.append('filename', 'test-image.jpg');
    }
  }
];

// Queue testing configuration
const QUEUE_TEST_CONFIG = {
  concurrentRequests: 5,
  batchSize: 3,
  delayBetweenBatches: 2000, // 2 seconds
};

/**
 * Execute a single test case
 */
async function executeTestCase(testCase, concurrent = false) {
  const testId = concurrent ? `${testCase.name}-${Date.now()}` : testCase.name;
  
  try {
    console.log(`${concurrent ? '📡' : '🧪'} Testing: ${testId}`);
    
    let requestOptions = {
      method: testCase.method,
    };

    // Setup request body
    if (testCase.isJSON && testCase.jsonBody) {
      requestOptions.headers = { 'Content-Type': 'application/json' };
      requestOptions.body = JSON.stringify(testCase.jsonBody);
    } else if (testCase.setupFormData) {
      const formData = new FormData();
      testCase.setupFormData(formData);
      requestOptions.body = formData;
    }
    
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}${testCase.endpoint}`, requestOptions);
    const responseTime = Date.now() - startTime;
    
    const result = await response.json();
    
    const success = response.ok && result.status !== 'error' && !result.error;
    
    if (success) {
      console.log(`✅ ${testId} - PASSED (${responseTime}ms)`);
      console.log(`   Status: ${response.status}, Service: ${testCase.service}`);
      if (result.status) console.log(`   Result: ${result.status}`);
    } else {
      console.log(`❌ ${testId} - FAILED (${responseTime}ms)`);
      console.log(`   Status: ${response.status}, Error: ${result.error || result.message || 'Unknown error'}`);
      if (result.details) console.log(`   Details: ${JSON.stringify(result.details)}`);
    }
    
    return { success, responseTime, testCase };
    
  } catch (error) {
    console.log(`❌ ${testId} - ERROR`);
    console.log(`   Error: ${error.message}`);
    return { success: false, error: error.message, testCase };
  }
}

/**
 * Test queuing functionality with concurrent requests
 */
async function testQueueFunctionality() {
  console.log('\n🚀 Testing Queue Functionality with Concurrent Requests...\n');
  
  // Get high-priority tests for queue testing
  const queueTests = testCases.filter(test => test.priority <= 2);
  
  const results = [];
  
  // Test concurrent requests in batches
  for (let batch = 0; batch < Math.ceil(queueTests.length / QUEUE_TEST_CONFIG.batchSize); batch++) {
    const batchStart = batch * QUEUE_TEST_CONFIG.batchSize;
    const batchTests = queueTests.slice(batchStart, batchStart + QUEUE_TEST_CONFIG.batchSize);
    
    console.log(`📦 Batch ${batch + 1}: Testing ${batchTests.length} concurrent requests...`);
    
    // Execute batch concurrently
    const batchPromises = [];
    for (let i = 0; i < QUEUE_TEST_CONFIG.concurrentRequests && i < batchTests.length; i++) {
      batchPromises.push(executeTestCase(batchTests[i], true));
    }
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Wait between batches
    if (batch < Math.ceil(queueTests.length / QUEUE_TEST_CONFIG.batchSize) - 1) {
      console.log(`⏱️  Waiting ${QUEUE_TEST_CONFIG.delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, QUEUE_TEST_CONFIG.delayBetweenBatches));
    }
  }
  
  return results;
}

/**
 * Run sequential smoke tests
 */
async function runSequentialTests() {
  console.log('\n🔍 Running Sequential API Tests...\n');
  
  const results = [];
  
  // Sort tests by priority
  const sortedTests = [...testCases].sort((a, b) => a.priority - b.priority);
  
  for (const testCase of sortedTests) {
    const result = await executeTestCase(testCase);
    results.push(result);
    
    // Small delay between sequential tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

/**
 * Display comprehensive results
 */
function displayResults(sequentialResults, queueResults = []) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE SMOKE TEST RESULTS');
  console.log('='.repeat(60));
  
  // Sequential test results
  const sequentialPassed = sequentialResults.filter(r => r.success).length;
  const sequentialTotal = sequentialResults.length;
  
  console.log('\n🔍 Sequential Test Results:');
  console.log(`✅ Passed: ${sequentialPassed}/${sequentialTotal} tests`);
  
  if (sequentialPassed < sequentialTotal) {
    console.log('\n❌ Failed Tests:');
    sequentialResults
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.testCase.name}: ${r.error || 'API error'}`));
  }
  
  // Queue test results
  if (queueResults.length > 0) {
    const queuePassed = queueResults.filter(r => r.success).length;
    const queueTotal = queueResults.length;
    
    console.log('\n🚀 Concurrent/Queue Test Results:');
    console.log(`✅ Passed: ${queuePassed}/${queueTotal} concurrent tests`);
    
    // Response time analysis
    const responseTimes = queueResults
      .filter(r => r.success && r.responseTime)
      .map(r => r.responseTime);
    
    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      
      console.log('\n📈 Performance Metrics:');
      console.log(`   Average Response Time: ${Math.round(avgResponseTime)}ms`);
      console.log(`   Fastest Response: ${minResponseTime}ms`);
      console.log(`   Slowest Response: ${maxResponseTime}ms`);
    }
  }
  
  // Service breakdown
  console.log('\n🏭 Results by Service:');
  const serviceStats = {};
  
  [...sequentialResults, ...queueResults].forEach(result => {
    const service = result.testCase.service;
    if (!serviceStats[service]) {
      serviceStats[service] = { passed: 0, total: 0 };
    }
    serviceStats[service].total++;
    if (result.success) serviceStats[service].passed++;
  });
  
  Object.entries(serviceStats).forEach(([service, stats]) => {
    const percentage = Math.round((stats.passed / stats.total) * 100);
    console.log(`   ${service.toUpperCase()}: ${stats.passed}/${stats.total} (${percentage}%)`);
  });
  
  // Overall results
  const totalPassed = sequentialPassed + (queueResults.filter(r => r.success).length);
  const totalTests = sequentialTotal + queueResults.length;
  const overallPercentage = Math.round((totalPassed / totalTests) * 100);
  
  console.log('\n🎯 Overall Results:');
  console.log(`✅ ${totalPassed}/${totalTests} tests passed (${overallPercentage}%)`);
  
  if (overallPercentage >= 80) {
    console.log('\n🎉 Smoke Test PASSED! APIs are functioning well.');
    console.log('🚀 System ready for load testing with 25-100 concurrent users.');
    
    if (queueResults.length > 0) {
      console.log('✅ Queue system is handling concurrent requests properly.');
    }
  } else if (overallPercentage >= 60) {
    console.log('\n⚠️  Smoke Test PARTIAL PASS. Some issues detected.');
    console.log('🔧 Consider fixing failed endpoints before full load testing.');
  } else {
    console.log('\n❌ Smoke Test FAILED. Major issues detected.');
    console.log('🛠️  Fix critical endpoints before proceeding with load testing.');
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  if (queueResults.length === 0) {
    console.log('   • Run with queue testing: node scripts/smoke-test.js --queue');
  }
  console.log('   • Monitor rate limiting behavior during high load');
  console.log('   • Test with different image/video URLs for comprehensive coverage');
  console.log('   • Consider implementing health check endpoints for faster monitoring');
}

/**
 * Main execution function
 */
async function runSmokeTest() {
  const args = process.argv.slice(2);
  const includeQueueTest = args.includes('--queue') || args.includes('-q');
  const queueOnly = args.includes('--queue-only');
  
  console.log('🧪 IMAI API Enhanced Smoke Test');
  console.log(`🎯 Base URL: ${baseUrl}`);
  console.log(`🔧 Queue Testing: ${includeQueueTest ? 'Enabled' : 'Disabled'}`);
  console.log(`📊 Total Endpoints: ${testCases.length}`);
  
  let sequentialResults = [];
  let queueResults = [];
  
  try {
    // Run sequential tests unless queue-only mode
    if (!queueOnly) {
      sequentialResults = await runSequentialTests();
    }
    
    // Run queue tests if requested
    if (includeQueueTest || queueOnly) {
      queueResults = await testQueueFunctionality();
    }
    
    // Display results
    displayResults(sequentialResults, queueResults);
    
  } catch (error) {
    console.error('\n❌ Smoke test execution failed:', error.message);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  console.log('Usage:');
  console.log('  node scripts/smoke-test.js           # Basic sequential tests');
  console.log('  node scripts/smoke-test.js --queue   # Include concurrent/queue testing');
  console.log('  node scripts/smoke-test.js --queue-only # Only queue testing');
  console.log('');
  
  runSmokeTest();
}

module.exports = { 
  runSmokeTest, 
  testCases, 
  executeTestCase, 
  testQueueFunctionality 
}; 