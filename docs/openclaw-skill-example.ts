/**
 * OpenClaw Skill 示例代码
 * 
 * 这是一个完整的 OpenClaw Skill 实现示例，展示如何调用 N+1 STUDIOS API
 * 
 * 使用方式：
 * 1. 复制此代码到 OpenClaw 项目的 skills/n1-design-tools/index.ts
 * 2. 在 skill.yaml 中配置 API 地址和 Token
 * 3. 在 OpenClaw Agent 中引入此 Skill
 */

import axios, { AxiosInstance } from 'axios';

// ─── 类型定义 ─────────────────────────────────────────

interface SkillConfig {
  api_base_url: string;
  api_token: string;
  default_tool_id?: number;
}

interface GenerationTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  errorMessage?: string;
  progress?: number;
}

interface RenderingParams {
  prompt: string;
  style?: string;
  aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3';
  toolId?: number;
}

interface VideoParams {
  mode: 'text-to-video' | 'image-to-video';
  prompt: string;
  duration: number;
  inputImageUrl?: string;
  toolId?: number;
}

interface ColorPlanParams {
  floorPlanUrl: string;
  referenceUrl?: string;
  extraPrompt?: string;
  toolId?: number;
}

// ─── N1DesignToolsSkill 类 ────────────────────────────

export class N1DesignToolsSkill {
  private config: SkillConfig;
  private client: AxiosInstance;

  constructor(config: SkillConfig) {
    this.config = config;
    this.validateConfig();
    
    // 初始化 HTTP 客户端
    this.client = axios.create({
      baseURL: `${config.api_base_url}/api/trpc`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_token}`,
      },
      timeout: 30000,
    });
  }

  private validateConfig(): void {
    if (!this.config.api_base_url) {
      throw new Error('缺少必需的配置: api_base_url');
    }
    if (!this.config.api_token) {
      throw new Error('缺少必需的配置: api_token');
    }
  }

  /**
   * 调用 tRPC 端点的通用方法
   */
  private async callTRPC<T = any>(
    endpoint: string,
    data?: any
  ): Promise<T> {
    try {
      const response = await this.client.post(endpoint, data);
      
      // tRPC 返回格式: { result: {...} } 或 { error: {...} }
      if (response.data.error) {
        throw new Error(
          `API 错误: ${response.data.error.message || '未知错误'}`
        );
      }
      
      return response.data.result as T;
    } catch (error: any) {
      console.error(`tRPC 调用失败 [${endpoint}]:`, error.message);
      throw error;
    }
  }

  /**
   * 生成 AI 效果图
   * 
   * 示例用法：
   * ```
   * const result = await skill.generateImage({
   *   prompt: "现代办公室，玻璃隔断，木质地板",
   *   style: "minimalist",
   *   aspectRatio: "16:9"
   * });
   * console.log(`效果图生成中，任务 ID: ${result.taskId}`);
   * ```
   */
  async generateImage(params: RenderingParams): Promise<GenerationTask> {
    console.log('📸 开始生成 AI 效果图...');
    console.log(`   提示词: ${params.prompt}`);
    console.log(`   风格: ${params.style || 'default'}`);
    
    const toolId = params.toolId || this.config.default_tool_id || 1;
    
    try {
      const result = await this.callTRPC('rendering.generate', {
        prompt: params.prompt,
        style: params.style || 'modern',
        aspectRatio: params.aspectRatio || '16:9',
        toolId,
      });

      const task: GenerationTask = {
        taskId: result.taskId,
        status: result.status,
        resultUrl: result.imageUrl,
        errorMessage: result.errorMessage,
        progress: 10,
      };

      if (task.status === 'failed') {
        console.error(`❌ 效果图生成失败: ${task.errorMessage}`);
      } else {
        console.log(`✅ 效果图任务已提交，ID: ${task.taskId}`);
        console.log(`   预计等待时间: 30 秒`);
      }

      return task;
    } catch (error: any) {
      console.error('❌ 生成效果图出错:', error.message);
      throw error;
    }
  }

  /**
   * 生成 AI 视频
   * 
   * 示例用法：
   * ```
   * // 文生视频
   * const result = await skill.generateVideo({
   *   mode: "text-to-video",
   *   prompt: "镜头缓慢推进，展示现代办公室",
   *   duration: 5
   * });
   * 
   * // 图生视频
   * const result = await skill.generateVideo({
   *   mode: "image-to-video",
   *   prompt: "添加人物走动和光线变化",
   *   duration: 3,
   *   inputImageUrl: "https://..."
   * });
   * ```
   */
  async generateVideo(params: VideoParams): Promise<GenerationTask> {
    console.log('🎬 开始生成 AI 视频...');
    console.log(`   模式: ${params.mode}`);
    console.log(`   时长: ${params.duration} 秒`);
    console.log(`   提示词: ${params.prompt}`);
    
    if (params.mode === 'image-to-video' && !params.inputImageUrl) {
      throw new Error('图生视频模式需要提供 inputImageUrl');
    }
    
    if (params.duration < 1 || params.duration > 8) {
      throw new Error('视频时长必须在 1-8 秒之间');
    }

    const toolId = params.toolId || this.config.default_tool_id || 1;

    try {
      const result = await this.callTRPC('video.generate', {
        mode: params.mode,
        prompt: params.prompt,
        duration: params.duration,
        inputImageUrl: params.inputImageUrl,
        toolId,
      });

      const task: GenerationTask = {
        taskId: result.taskId,
        status: result.status,
        resultUrl: result.videoUrl,
        errorMessage: result.errorMessage,
        progress: 10,
      };

      if (task.status === 'failed') {
        console.error(`❌ 视频生成失败: ${task.errorMessage}`);
      } else {
        console.log(`✅ 视频任务已提交，ID: ${task.taskId}`);
        console.log(`   预计等待时间: ${60 + params.duration * 10} 秒`);
      }

      return task;
    } catch (error: any) {
      console.error('❌ 生成视频出错:', error.message);
      throw error;
    }
  }

  /**
   * 生成 AI 平面图
   * 
   * 示例用法：
   * ```
   * const result = await skill.generateColorPlan({
   *   floorPlanUrl: "https://...",
   *   referenceUrl: "https://...",
   *   extraPrompt: "北欧风格，浅色系"
   * });
   * ```
   */
  async generateColorPlan(params: ColorPlanParams): Promise<GenerationTask> {
    console.log('🏠 开始生成 AI 平面图...');
    console.log(`   底图 URL: ${params.floorPlanUrl.substring(0, 50)}...`);
    
    if (!params.floorPlanUrl) {
      throw new Error('必须提供平面底图 URL');
    }

    const toolId = params.toolId || this.config.default_tool_id || 1;

    try {
      const result = await this.callTRPC('colorPlan.generate', {
        floorPlanUrl: params.floorPlanUrl,
        referenceUrl: params.referenceUrl,
        extraPrompt: params.extraPrompt,
        toolId,
      });

      const task: GenerationTask = {
        taskId: result.taskId,
        status: result.status,
        resultUrl: result.imageUrl,
        errorMessage: result.errorMessage,
        progress: 10,
      };

      if (task.status === 'failed') {
        console.error(`❌ 平面图生成失败: ${task.errorMessage}`);
      } else {
        console.log(`✅ 平面图任务已提交，ID: ${task.taskId}`);
        console.log(`   预计等待时间: 45 秒`);
      }

      return task;
    } catch (error: any) {
      console.error('❌ 生成平面图出错:', error.message);
      throw error;
    }
  }

  /**
   * 查询生成任务状态
   * 
   * 示例用法：
   * ```
   * const status = await skill.getTaskStatus('task_abc123', 'image');
   * if (status.status === 'completed') {
   *   console.log('生成完成:', status.resultUrl);
   * } else if (status.status === 'failed') {
   *   console.log('生成失败:', status.errorMessage);
   * } else {
   *   console.log('生成中...', status.progress + '%');
   * }
   * ```
   */
  async getTaskStatus(
    taskId: string,
    type: 'image' | 'video' | 'colorplan'
  ): Promise<GenerationTask> {
    const endpoint = {
      image: 'rendering.getStatus',
      video: 'video.getStatus',
      colorplan: 'colorPlan.getStatus',
    }[type];

    try {
      const result = await this.callTRPC(endpoint, { taskId });

      return {
        taskId,
        status: result.status,
        resultUrl: result.imageUrl || result.videoUrl,
        errorMessage: result.errorMessage,
        progress: result.progress,
      };
    } catch (error: any) {
      console.error(`❌ 查询任务状态失败 [${taskId}]:`, error.message);
      throw error;
    }
  }

  /**
   * 等待任务完成（轮询）
   * 
   * 示例用法：
   * ```
   * const result = await skill.waitForCompletion('task_abc123', 'image', {
   *   maxWaitTime: 120000, // 最多等待 2 分钟
   *   pollInterval: 5000,  // 每 5 秒查询一次
   * });
   * ```
   */
  async waitForCompletion(
    taskId: string,
    type: 'image' | 'video' | 'colorplan',
    options: {
      maxWaitTime?: number;
      pollInterval?: number;
    } = {}
  ): Promise<GenerationTask> {
    const maxWaitTime = options.maxWaitTime || 180000; // 3 分钟
    const pollInterval = options.pollInterval || 5000;  // 5 秒
    const startTime = Date.now();

    console.log(`⏳ 等待任务完成 [${taskId}]...`);

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getTaskStatus(taskId, type);

      if (status.status === 'completed') {
        console.log(`✅ 任务完成！结果: ${status.resultUrl}`);
        return status;
      } else if (status.status === 'failed') {
        console.error(`❌ 任务失败: ${status.errorMessage}`);
        throw new Error(`任务失败: ${status.errorMessage}`);
      } else {
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `⏳ 任务进行中... (${elapsedTime}s, 进度: ${status.progress || 0}%)`
        );
        
        // 等待后再查询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`任务超时 (超过 ${maxWaitTime / 1000} 秒)`);
  }

  /**
   * 列出素材库资源
   * 
   * 示例用法：
   * ```
   * const assets = await skill.listAssets();
   * console.log(`素材库中有 ${assets.length} 个资源`);
   * ```
   */
  async listAssets(): Promise<any[]> {
    console.log('📚 查询素材库...');
    
    try {
      const result = await this.callTRPC('assets.list');
      console.log(`✅ 找到 ${result.length} 个素材`);
      return result;
    } catch (error: any) {
      console.error('❌ 查询素材库失败:', error.message);
      throw error;
    }
  }
}

// ─── 使用示例 ──────────────────────────────────────────

/**
 * 完整的工作流示例
 */
export async function exampleWorkflow() {
  // 1. 初始化 Skill
  const skill = new N1DesignToolsSkill({
    api_base_url: 'https://platform.nplusonestudios.com',
    api_token: 'your-jwt-token-here',
    default_tool_id: 1,
  });

  try {
    // 2. 生成效果图
    console.log('\n=== 生成效果图 ===');
    const imageTask = await skill.generateImage({
      prompt: '现代办公室，玻璃隔断，木质地板，自然采光',
      style: 'minimalist',
      aspectRatio: '16:9',
    });

    // 3. 等待效果图完成
    const imageResult = await skill.waitForCompletion(
      imageTask.taskId,
      'image',
      { maxWaitTime: 60000 }
    );
    console.log('效果图 URL:', imageResult.resultUrl);

    // 4. 生成视频
    console.log('\n=== 生成视频 ===');
    const videoTask = await skill.generateVideo({
      mode: 'image-to-video',
      prompt: '镜头缓慢推进，展示办公室全景',
      duration: 5,
      inputImageUrl: imageResult.resultUrl,
    });

    // 5. 等待视频完成
    const videoResult = await skill.waitForCompletion(
      videoTask.taskId,
      'video',
      { maxWaitTime: 120000 }
    );
    console.log('视频 URL:', videoResult.resultUrl);

    // 6. 查询素材库
    console.log('\n=== 查询素材库 ===');
    const assets = await skill.listAssets();
    console.log('素材数量:', assets.length);

  } catch (error) {
    console.error('工作流执行失败:', error);
  }
}

// 导出 Skill 类供 OpenClaw 使用
export default N1DesignToolsSkill;
