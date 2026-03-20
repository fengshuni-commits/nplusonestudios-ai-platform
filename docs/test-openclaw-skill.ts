/**
 * OpenClaw Skill 测试脚本
 * 
 * 用于验证 OpenClaw Skill 与网站 API 的集成是否正常工作
 * 
 * 使用方式：
 * 1. 修改下面的配置信息（api_base_url 和 api_token）
 * 2. 运行：npx ts-node test-openclaw-skill.ts
 */

import axios from 'axios';

// ─── 配置信息 ────────────────────────────────────────

const CONFIG = {
  // 网站地址（改为你的实际地址）
  api_base_url: process.env.API_BASE_URL || 'http://localhost:3000',
  
  // API Token（改为你的实际 Token）
  api_token: process.env.API_TOKEN || 'your-jwt-token-here',
  
  // 默认工具 ID
  default_tool_id: parseInt(process.env.DEFAULT_TOOL_ID || '1'),
};

// ─── 测试工具类 ──────────────────────────────────────

class SkillTester {
  private client = axios.create({
    baseURL: `${CONFIG.api_base_url}/api/trpc`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.api_token}`,
    },
    timeout: 30000,
  });

  private testResults: Array<{
    name: string;
    status: 'pass' | 'fail';
    duration: number;
    error?: string;
  }> = [];

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🧪 OpenClaw Skill 集成测试\n');
    console.log(`API 地址: ${CONFIG.api_base_url}`);
    console.log(`工具 ID: ${CONFIG.default_tool_id}\n`);

    try {
      // 1. 测试连接
      await this.testConnection();

      // 2. 测试生成效果图
      await this.testGenerateImage();

      // 3. 测试生成视频
      await this.testGenerateVideo();

      // 4. 测试生成平面图
      await this.testGenerateColorPlan();

      // 5. 测试查询素材库
      await this.testListAssets();

      // 6. 打印测试结果
      this.printResults();
    } catch (error: any) {
      console.error('❌ 测试执行失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 测试 API 连接
   */
  private async testConnection() {
    const startTime = Date.now();
    console.log('测试 1/5: API 连接...');

    try {
      const response = await this.client.post('rendering.generate', {
        prompt: 'test',
        style: 'modern',
        aspectRatio: '16:9',
        toolId: CONFIG.default_tool_id,
      });

      const duration = Date.now() - startTime;
      
      if (response.status === 200) {
        console.log('✅ 连接成功\n');
        this.testResults.push({
          name: 'API 连接',
          status: 'pass',
          duration,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ 连接失败: ${error.message}\n`);
      this.testResults.push({
        name: 'API 连接',
        status: 'fail',
        duration,
        error: error.message,
      });
    }
  }

  /**
   * 测试生成效果图
   */
  private async testGenerateImage() {
    const startTime = Date.now();
    console.log('测试 2/5: 生成 AI 效果图...');

    try {
      const response = await this.client.post('rendering.generate', {
        prompt: '现代办公室，玻璃隔断，木质地板，自然采光',
        style: 'minimalist',
        aspectRatio: '16:9',
        toolId: CONFIG.default_tool_id,
      });

      const duration = Date.now() - startTime;
      const result = response.data.result;

      if (result && result.taskId) {
        console.log(`✅ 效果图任务已提交`);
        console.log(`   任务 ID: ${result.taskId}`);
        console.log(`   状态: ${result.status}`);
        console.log(`   预计等待: 30 秒\n`);

        this.testResults.push({
          name: '生成 AI 效果图',
          status: 'pass',
          duration,
        });

        // 等待 5 秒后查询状态
        await this.delay(5000);
        await this.testGetStatus(result.taskId, 'image');
      } else {
        throw new Error('未返回 taskId');
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ 生成失败: ${error.message}\n`);
      this.testResults.push({
        name: '生成 AI 效果图',
        status: 'fail',
        duration,
        error: error.message,
      });
    }
  }

  /**
   * 测试生成视频
   */
  private async testGenerateVideo() {
    const startTime = Date.now();
    console.log('测试 3/5: 生成 AI 视频...');

    try {
      const response = await this.client.post('video.generate', {
        mode: 'text-to-video',
        prompt: '镜头缓慢推进，展示现代办公室全景',
        duration: 3,
        toolId: CONFIG.default_tool_id,
      });

      const duration = Date.now() - startTime;
      const result = response.data.result;

      if (result && result.taskId) {
        console.log(`✅ 视频任务已提交`);
        console.log(`   任务 ID: ${result.taskId}`);
        console.log(`   状态: ${result.status}`);
        console.log(`   预计等待: 90 秒\n`);

        this.testResults.push({
          name: '生成 AI 视频',
          status: 'pass',
          duration,
        });

        // 等待 5 秒后查询状态
        await this.delay(5000);
        await this.testGetStatus(result.taskId, 'video');
      } else {
        throw new Error('未返回 taskId');
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ 生成失败: ${error.message}\n`);
      this.testResults.push({
        name: '生成 AI 视频',
        status: 'fail',
        duration,
        error: error.message,
      });
    }
  }

  /**
   * 测试生成平面图
   */
  private async testGenerateColorPlan() {
    const startTime = Date.now();
    console.log('测试 4/5: 生成 AI 平面图...');

    try {
      // 使用一个示例平面图 URL
      const floorPlanUrl = 'https://via.placeholder.com/800x600?text=Floor+Plan';

      const response = await this.client.post('colorPlan.generate', {
        floorPlanUrl,
        extraPrompt: '北欧风格，浅色系，木质家具',
        toolId: CONFIG.default_tool_id,
      });

      const duration = Date.now() - startTime;
      const result = response.data.result;

      if (result && result.taskId) {
        console.log(`✅ 平面图任务已提交`);
        console.log(`   任务 ID: ${result.taskId}`);
        console.log(`   状态: ${result.status}`);
        console.log(`   预计等待: 45 秒\n`);

        this.testResults.push({
          name: '生成 AI 平面图',
          status: 'pass',
          duration,
        });

        // 等待 5 秒后查询状态
        await this.delay(5000);
        await this.testGetStatus(result.taskId, 'colorplan');
      } else {
        throw new Error('未返回 taskId');
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ 生成失败: ${error.message}\n`);
      this.testResults.push({
        name: '生成 AI 平面图',
        status: 'fail',
        duration,
        error: error.message,
      });
    }
  }

  /**
   * 测试查询任务状态
   */
  private async testGetStatus(taskId: string, type: 'image' | 'video' | 'colorplan') {
    try {
      const endpoint = {
        image: 'rendering.getStatus',
        video: 'video.getStatus',
        colorplan: 'colorPlan.getStatus',
      }[type];

      const response = await this.client.post(endpoint, { taskId });
      const result = response.data.result;

      console.log(`   状态查询: ${result.status}`);
      if (result.progress) {
        console.log(`   进度: ${result.progress}%`);
      }
    } catch (error: any) {
      console.log(`   状态查询失败: ${error.message}`);
    }
  }

  /**
   * 测试查询素材库
   */
  private async testListAssets() {
    const startTime = Date.now();
    console.log('测试 5/5: 查询素材库...');

    try {
      const response = await this.client.post('assets.list');
      const duration = Date.now() - startTime;
      const result = response.data.result;

      if (Array.isArray(result)) {
        console.log(`✅ 素材库查询成功`);
        console.log(`   素材数量: ${result.length}\n`);

        this.testResults.push({
          name: '查询素材库',
          status: 'pass',
          duration,
        });
      } else {
        throw new Error('返回格式不正确');
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ 查询失败: ${error.message}\n`);
      this.testResults.push({
        name: '查询素材库',
        status: 'fail',
        duration,
        error: error.message,
      });
    }
  }

  /**
   * 打印测试结果
   */
  private printResults() {
    console.log('📊 测试结果摘要\n');
    console.log('┌─────────────────────────────────────────────┐');

    let passCount = 0;
    let failCount = 0;

    for (const result of this.testResults) {
      const icon = result.status === 'pass' ? '✅' : '❌';
      const status = result.status === 'pass' ? 'PASS' : 'FAIL';
      const duration = `${result.duration}ms`;

      console.log(`│ ${icon} ${result.name.padEnd(30)} ${status.padEnd(6)} ${duration}`);

      if (result.error) {
        console.log(`│    错误: ${result.error}`);
      }

      if (result.status === 'pass') {
        passCount++;
      } else {
        failCount++;
      }
    }

    console.log('└─────────────────────────────────────────────┘');
    console.log(`\n总计: ${passCount} 通过, ${failCount} 失败\n`);

    if (failCount === 0) {
      console.log('🎉 所有测试通过！OpenClaw Skill 集成正常。\n');
      process.exit(0);
    } else {
      console.log('⚠️  有测试失败，请检查配置和错误信息。\n');
      process.exit(1);
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── 运行测试 ─────────────────────────────────────────

const tester = new SkillTester();
tester.runAllTests().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
