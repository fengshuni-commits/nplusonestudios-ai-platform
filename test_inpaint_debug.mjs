// Test script to debug inpaint tool detection
const tool1 = {
  provider: 'gemini',
  apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
  configJson: {aspectRatio: '1:1', imageSize: '1K', modelName: 'gemini-3.1-flash-image-preview', provider: 'gemini'},
};

const tool2 = {
  provider: null,
  apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
  configJson: {modelName: 'gemini-3-flash-preview'},
};

function detectProvider(tool) {
  let provider = tool.provider?.toLowerCase() || '';
  if (!provider) {
    const ep = tool.apiEndpoint || '';
    if (ep.includes('dashscope.aliyuncs.com')) {
      provider = 'qwen';
    } else if (ep.includes('generativelanguage.googleapis.com')) {
      provider = 'gemini';
    } else {
      provider = 'unknown';
    }
  }
  return provider;
}

function getModelName(tool) {
  const config = tool.configJson || {};
  return config.imageModel || config.modelName || 'gemini-3.1-flash-image-preview';
}

function checkIsProPreview(modelName) {
  return /gemini-3.*pro.*preview|gemini-3-pro/i.test(modelName);
}

console.log('=== Tool 1 (Gemini 3, explicit provider) ===');
const p1 = detectProvider(tool1);
const m1 = getModelName(tool1);
const isPro1 = checkIsProPreview(m1);
console.log('Provider:', p1, '| Model:', m1, '| isProPreview:', isPro1);

console.log('\n=== Tool 2 (Gemini 3 flash, no provider field) ===');
const p2 = detectProvider(tool2);
const m2 = getModelName(tool2);
const isPro2 = checkIsProPreview(m2);
console.log('Provider:', p2, '| Model:', m2, '| isProPreview:', isPro2);

// Simulate imageConfig for inpainting
function buildImageConfig(tool) {
  const provider = detectProvider(tool);
  const modelName = getModelName(tool);
  const isProPreview = checkIsProPreview(modelName);
  const config = tool.configJson || {};
  
  let aspectRatio = config.aspectRatio || '1:1';
  let imageSize = config.imageSize || '1K';
  
  // Override with size if provided (1024x1365 -> 3:4)
  const size = '1024x1365';
  const [w, h] = size.split('x').map(Number);
  if (w && h) {
    const ratio = w / h;
    if (ratio > 1.7) aspectRatio = '16:9';
    else if (ratio > 1.2) aspectRatio = '4:3';
    else if (ratio < 0.6) aspectRatio = '9:16';
    else if (ratio < 0.85) aspectRatio = '3:4';
    else aspectRatio = '1:1';
  }
  
  const imageConfig = {};
  if (!isProPreview) {
    if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
    if (imageSize) imageConfig.imageSize = imageSize;
  }
  return { provider, modelName, isProPreview, aspectRatio, imageSize, imageConfig };
}

console.log('\n=== Inpaint imageConfig simulation ===');
console.log('Tool 1:', JSON.stringify(buildImageConfig(tool1)));
console.log('Tool 2:', JSON.stringify(buildImageConfig(tool2)));
