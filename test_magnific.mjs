import { config } from 'dotenv';
config();

const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;
console.log('FREEPIK_API_KEY exists:', !!FREEPIK_API_KEY);
console.log('FREEPIK_API_KEY length:', FREEPIK_API_KEY?.length);

// 测试 API 连通性
const testUrl = 'https://api.freepik.com/v1/ai/image-upscaler';
console.log('\n测试 API 端点:', testUrl);

try {
  const res = await fetch(testUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': FREEPIK_API_KEY || '',
    },
    body: JSON.stringify({
      image: { url: 'https://example.com/test.jpg' },
      scale_factor: 2,
      style: '3d_renders',
    }),
  });
  console.log('HTTP Status:', res.status);
  const body = await res.text();
  console.log('Response body:', body.substring(0, 500));
} catch (e) {
  console.error('请求失败:', e.message);
}
