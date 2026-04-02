import { useState } from "react";
import { Copy, Check, ExternalLink, Shield, Terminal, Clock, ArrowRight, FileJson, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const BASE_URL = window.location.origin;

// ── 完整调用示例代码 ──────────────────────────────────────
const NODE_EXAMPLE = `/**
 * N+1 STUDIOS AI API - Node.js 完整调用示例
 * 需要 Node.js 18+（内置 fetch），无需额外依赖
 */

const BASE_URL = 'https://platform.nplusonestudios.com';
const API_TOKEN = 'sk_1774xxxxxxxxx_xxxxxxxxxx'; // 替换为你的 Token

const headers = {
  'Authorization': 'Bearer ' + API_TOKEN,
  'Content-Type': 'application/json',
};

// ── 1. 获取项目列表 ────────────────────────────
async function getProjects() {
  const res = await fetch(BASE_URL + '/api/v1/projects', { headers });
  const data = await res.json();
  return data.data; // Array of projects
}

// ── 2. 获取项目任务列表 ──────────────────────
async function getProjectTasks(projectId) {
  const res = await fetch(BASE_URL + '/api/v1/projects/' + projectId + '/tasks', { headers });
  const data = await res.json();
  return data.data; // Array of tasks
}

// ── 3. AI 效果图生成（异步轮询）──────────────────────────
async function generateRendering(prompt, style) {
  // Step 1: 提交任务
  const submitRes = await fetch(BASE_URL + '/api/v1/ai/render', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, style }),
  });
  const submitData = await submitRes.json();
  const { jobId } = submitData.data;
  console.log('任务已提交，jobId:', jobId);

  // Step 2: 轮询结果（每 3 秒）
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(BASE_URL + '/api/v1/ai/render/' + jobId, { headers });
    const pollData = await pollRes.json();
    const { status, url, error } = pollData.data;

    if (status === 'done') {
      console.log('效果图生成完成:', url);
      return url; // CDN 图片 URL
    }
    if (status === 'failed') {
      throw new Error('生成失败: ' + error);
    }
    console.log('生成中，继续等待...');
  }
}

// ── 4. 案例调研报告生成（同步）───────────────────
async function generateBenchmarkReport(projectName, requirements) {
  const res = await fetch(BASE_URL + '/api/v1/ai/benchmark', {
    method: 'POST',
    headers,
    body: JSON.stringify({ projectName, requirements, referenceCount: 5 }),
  });
  const data = await res.json();
  return data.data.content; // Markdown 格式报告
}

// ── 主函数示例 ───────────────────────────────────────────
async function main() {
  // 获取项目列表
  const projects = await getProjects();
  console.log('项目数量:', projects.length);

  if (projects.length > 0) {
    // 获取第一个项目的任务
    const tasks = await getProjectTasks(projects[0].id);
    console.log('任务数量:', tasks.length);
  }

  // 生成效果图
  const imageUrl = await generateRendering(
    '现代科技办公空间，开放式布局，玻璃隔断，北欧风格',
    'minimalist'
  );
  console.log('效果图 URL:', imageUrl);

  // 生成案例调研报告
  const report = await generateBenchmarkReport(
    '百悦科技园办公空间',
    '工业风科技感办公空间，面积约3000㎡，需要展示科技公司的创新文化'
  );
  console.log('报告内容（前200字）:', report.slice(0, 200));
}

main().catch(console.error);`;

const PYTHON_EXAMPLE = `"""
N+1 STUDIOS AI API - Python 完整调用示例
需要 Python 3.8+，安装依赖：pip install requests
"""

import time
import requests

BASE_URL = 'https://platform.nplusonestudios.com'
API_TOKEN = 'sk_1774xxxxxxxxx_xxxxxxxxxx'  # 替换为你的 Token

HEADERS = {
    'Authorization': f'Bearer {API_TOKEN}',
    'Content-Type': 'application/json',
}


# ── 1. 获取项目列表 ────────────────────────────────────────
def get_projects():
    res = requests.get(f'{BASE_URL}/api/v1/projects', headers=HEADERS)
    res.raise_for_status()
    return res.json()['data']


# ── 2. 获取项目任务列表 ──────────────────────
def get_project_tasks(project_id):
    res = requests.get(f'{BASE_URL}/api/v1/projects/{project_id}/tasks', headers=HEADERS)
    res.raise_for_status()
    return res.json()['data']


# ── 3. AI 效果图生成（异步轮询）──────────────────────────
def generate_rendering(prompt, style=None):
    # Step 1: 提交任务
    payload = {'prompt': prompt}
    if style:
        payload['style'] = style
    res = requests.post(f'{BASE_URL}/api/v1/ai/render', json=payload, headers=HEADERS)
    res.raise_for_status()
    job_id = res.json()['data']['jobId']
    print(f'任务已提交，jobId: {job_id}')

    # Step 2: 轮询结果（每 3 秒）
    while True:
        time.sleep(3)
        poll_res = requests.get(f'{BASE_URL}/api/v1/ai/render/{job_id}', headers=HEADERS)
        poll_res.raise_for_status()
        data = poll_res.json()['data']

        if data['status'] == 'done':
            print(f'效果图生成完成: {data["url"]}')
            return data['url']  # CDN 图片 URL
        if data['status'] == 'failed':
            raise RuntimeError(f'生成失败: {data.get("error")}')
        print('生成中，继续等待...')


# ── 4. 案例调研报告生成（同步）───────────────────
def generate_benchmark_report(project_name, requirements):
    payload = {'projectName': project_name, 'requirements': requirements, 'referenceCount': 5}
    res = requests.post(f'{BASE_URL}/api/v1/ai/benchmark', json=payload, headers=HEADERS)
    res.raise_for_status()
    return res.json()['data']['content']  # Markdown 格式报告


# ── 主函数示例 ───────────────────────────────────────────
if __name__ == '__main__':
    # 获取项目列表
    projects = get_projects()
    print(f'项目数量: {len(projects)}')

    if projects:
        # 获取第一个项目的任务
        tasks = get_project_tasks(projects[0]['id'])
        print(f'任务数量: {len(tasks)}')

    # 生成效果图
    image_url = generate_rendering(
        '现代科技办公空间，开放式布局，玻璃隔断，北欧风格',
        style='minimalist'
    )
    print(f'效果图 URL: {image_url}')

    # 生成案例调研报告
    report = generate_benchmark_report(
        '百悦科技园办公空间',
        '工业风科技感办公空间，面积约3000㎡，需要展示科技公司的创新文化'
    )
    print(f'报告内容（前200字）: {report[:200]}')`;

// ── CopyButton 辅助组件 ──────────────────────────────────
function CopyButton({
  text,
  copyKey,
  copiedKey,
  copyToClipboard,
}: {
  text: string;
  copyKey: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => copyToClipboard(text, copyKey)}
      className="gap-1 text-xs shrink-0"
    >
      {copiedKey === copyKey ? (
        <><Check className="w-3 h-3" /> 已复制</>
      ) : (
        <><Copy className="w-3 h-3" /> 复制全部</>
      )}
    </Button>
  );
}

type ApiParam = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
};

type ApiResponseField = {
  name: string;
  type: string;
  description: string;
};

type ApiDef = {
  name: string;
  endpoint: string;
  description: string;
  method: "POST" | "GET";
  generationTime: string;
  isAsync?: boolean;
  asyncNote?: string;
  params: ApiParam[];
  responseFields: ApiResponseField[];
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  curlExample: string;
};

// ── 同步 API ──────────────────────────────────────────────
const syncApis: ApiDef[] = [
  {
    name: "AI 视频生成",
    endpoint: "video.generate",
    description: "根据文本描述或参考图片生成设计视频，支持文生视频和图生视频两种模式",
    method: "POST",
    generationTime: "约 60-120 秒（需轮询 video.getStatus）",
    params: [
      { name: "mode", type: "string", required: true, description: "生成模式：text（文生视频）或 image（图生视频）" },
      { name: "prompt", type: "string", required: false, description: "视频描述（文生视频时必需）" },
      { name: "imageUrl", type: "string", required: false, description: "首帧图片 URL（图生视频时必需）" },
      { name: "duration", type: "number", required: false, default: "5", description: "视频时长（秒）：5 或 10" },
    ],
    responseFields: [
      { name: "taskId", type: "string", description: "任务 ID，用于轮询查询进度" },
      { name: "status", type: "string", description: "初始状态：pending" },
      { name: "historyId", type: "number", description: "生成记录 ID" },
    ],
    requestExample: {
      mode: "text",
      prompt: "现代办公空间中的员工工作场景，光线充足，节奏轻快",
      duration: 5,
    },
    responseExample: {
      result: {
        data: {
          json: {
            taskId: "task_1234567890",
            status: "pending",
            historyId: 12345,
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/video.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"mode":"text","prompt":"现代办公空间工作场景，光线充足","duration":5}}'`,
  },
  {
    name: "AI 平面图生成",
    endpoint: "rendering.colorPlan",
    description: "根据上传的底图（黑白平面图）生成彩色渲染平面图",
    method: "POST",
    generationTime: "约 30-50 秒",
    params: [
      { name: "imageUrl", type: "string", required: true, description: "底图 URL（黑白平面图，建议先上传到素材库）" },
      { name: "prompt", type: "string", required: true, description: "配色和风格描述" },
      { name: "projectId", type: "number | null", required: false, default: "null", description: "关联项目 ID（可选）" },
    ],
    responseFields: [
      { name: "url", type: "string", description: "生成的彩色平面图 CDN URL" },
      { name: "prompt", type: "string", description: "实际使用的提示词" },
      { name: "historyId", type: "number", description: "生成记录 ID" },
    ],
    requestExample: {
      imageUrl: "https://cdn.example.com/floor-plan.jpg",
      prompt: "温暖的木色和白色，点缀绿色植物，现代简约风格",
      projectId: null,
    },
    responseExample: {
      result: {
        data: {
          json: {
            url: "https://d2xsxph8kpxj0f.cloudfront.net/color-plan/xxx.jpg",
            prompt: "温暖的木色和白色，点缀绿色植物，现代简约风格",
            historyId: 840002,
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/rendering.colorPlan' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"imageUrl":"https://cdn.example.com/floor-plan.jpg","prompt":"温暖木色，现代简约","projectId":null}}'`,
  },
];

// ── AI 分析图 API（两步流程）──────────────────────────────
type AnalysisImageStep = {
  step: number;
  name: string;
  endpoint: string;
  method: "POST" | "GET";
  description: string;
  params: ApiParam[];
  responseFields: ApiResponseField[];
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  curlExample: string;
};

const ASPECT_RATIO_OPTIONS = [
  { label: "1:1 正方形", value: "1024x1024" },
  { label: "4:3 横版", value: "1024x768" },
  { label: "3:2 横版", value: "1024x683" },
  { label: "16:9 宽屏", value: "1024x576" },
  { label: "3:4 竖版", value: "768x1024" },
  { label: "2:3 竖版", value: "683x1024" },
];

const analysisImageSteps: AnalysisImageStep[] = [
  {
    step: 1,
    name: "提交分析图生成任务",
    endpoint: "analysisImage.submit",
    method: "POST",
    description: "提交 AI 分析图生成任务，支持一次生成 1-3 张并行图片，立即返回 jobId 数组，后台异步生成（约 30-60 秒）",
    params: [
      { name: "type", type: "string", required: true, description: "分析类型：material（材质分析图）或 soft_furnishing（软装配图）" },
      { name: "referenceImageUrl", type: "string", required: true, description: "参考图片 URL（已上传至素材库的图片）" },
      { name: "aspectRatio", type: "string", required: false, default: "\"1024x1024\"", description: `图片尺寸，格式 \"WxH\"。可选值：${ASPECT_RATIO_OPTIONS.map(o => `${o.value}（${o.label}）`).join('、')}` },
      { name: "count", type: "number", required: false, default: "1", description: "生成数量 1-3，选 3 时并行提交三个独立 job" },
      { name: "extraPrompt", type: "string", required: false, description: "额外提示词，追加到系统提示词末尾（可选）" },
      { name: "toolId", type: "number", required: false, description: "指定 AI 工具 ID（可选，不传则使用默认工具）" },
    ],
    responseFields: [
      { name: "jobId", type: "string", description: "第一个任务 ID（count=1 时使用此字段轮询）" },
      { name: "jobIds", type: "string[]", description: "所有任务 ID 数组（count>1 时使用此字段批量轮询）" },
    ],
    requestExample: {
      type: "material",
      referenceImageUrl: "https://cdn.example.com/space-photo.jpg",
      aspectRatio: "1024x576",
      count: 3,
    },
    responseExample: {
      result: {
        data: {
          json: {
            jobId: "V1StGXR8_Z5jdHi6B-myT",
            jobIds: ["V1StGXR8_Z5jdHi6B-myT", "K9mNpQR2_X7keLm3C-abZ", "R3pQwXY4_A8mfNn5D-cdE"],
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/analysisImage.submit' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"type":"material","referenceImageUrl":"https://cdn.example.com/space.jpg","aspectRatio":"1024x576","count":3}}'`,
  },
  {
    step: 2,
    name: "轮询单个任务状态",
    endpoint: "analysisImage.pollJob",
    method: "GET",
    description: "查询单个分析图任务的状态。建议每 3 秒轮询一次，直到 status 变为 done 或 failed",
    params: [
      { name: "jobId", type: "string", required: true, description: "第一步返回的任务 ID" },
    ],
    responseFields: [
      { name: "status", type: "string", description: "任务状态：pending / processing / done / failed / not_found" },
      { name: "url", type: "string", description: "生成的图片 CDN URL（仅 status=done 时返回）" },
      { name: "historyId", type: "number", description: "生成记录 ID（仅 status=done 时返回）" },
      { name: "error", type: "string", description: "错误信息（仅 status=failed 时返回）" },
    ],
    requestExample: { jobId: "V1StGXR8_Z5jdHi6B-myT" },
    responseExample: {
      result: {
        data: {
          json: {
            status: "done",
            url: "https://d2xsxph8kpxj0f.cloudfront.net/analysis/xxx.jpg",
            historyId: 840020,
          }
        }
      }
    },
    curlExample: `curl -G '${BASE_URL}/api/trpc/analysisImage.pollJob' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  --data-urlencode 'input={"json":{"jobId":"V1StGXR8_Z5jdHi6B-myT"}}'`,
  },
  {
    step: 3,
    name: "批量轮询多个任务状态",
    endpoint: "analysisImage.pollJobs",
    method: "GET",
    description: "一次查询多个分析图任务的状态（count>1 时推荐使用），减少请求次数",
    params: [
      { name: "jobIds", type: "string[]", required: true, description: "第一步返回的 jobIds 数组" },
    ],
    responseFields: [
      { name: "jobId", type: "string", description: "任务 ID" },
      { name: "status", type: "string", description: "任务状态：pending / processing / done / failed / not_found" },
      { name: "url", type: "string", description: "生成的图片 CDN URL（仅 status=done 时返回）" },
      { name: "historyId", type: "number", description: "生成记录 ID（仅 status=done 时返回）" },
      { name: "error", type: "string", description: "错误信息（仅 status=failed 时返回）" },
    ],
    requestExample: { jobIds: ["V1StGXR8_Z5jdHi6B-myT", "K9mNpQR2_X7keLm3C-abZ", "R3pQwXY4_A8mfNn5D-cdE"] },
    responseExample: {
      result: {
        data: {
          json: [
            { jobId: "V1StGXR8_Z5jdHi6B-myT", status: "done", url: "https://cdn.../analysis/1.jpg", historyId: 840020 },
            { jobId: "K9mNpQR2_X7keLm3C-abZ", status: "processing" },
            { jobId: "R3pQwXY4_A8mfNn5D-cdE", status: "pending" },
          ]
        }
      }
    },
    curlExample: `curl -G '${BASE_URL}/api/trpc/analysisImage.pollJobs' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  --data-urlencode 'input={"json":{"jobIds":["V1StGXR8_Z5jdHi6B-myT","K9mNpQR2_X7keLm3C-abZ"]}}'`,
  },
];

// ── 图文排版 API（两步流程）──────────────────────────────
type GraphicLayoutStep = {
  step: number;
  name: string;
  endpoint: string;
  method: "POST" | "GET";
  description: string;
  params: ApiParam[];
  responseFields: ApiResponseField[];
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  curlExample: string;
};

const graphicLayoutSteps: GraphicLayoutStep[] = [
  {
    step: 1,
    name: "提交图文排版生成任务",
    endpoint: "graphic-layout/generate",
    method: "POST",
    description: "提交图文排版生成任务，支持品牌手册、商品详情页、项目图板等类型，可生成 1-10 页，后台异步生成（每页约 30-60 秒）",
    params: [
      { name: "docType", type: "string", required: true, description: "文档类型：brand_manual（品牌手册）/ product_detail（商品详情页）/ project_board（项目图板）/ custom（自定义）" },
      { name: "contentText", type: "string", required: true, description: "内容描述，如品牌理念、产品信息、项目介绍等" },
      { name: "pageCount", type: "number", required: false, default: "1", description: "生成页数（1-10）" },
      { name: "aspectRatio", type: "string", required: false, default: "\"3:4\"", description: "页面比例：3:4（默认竖版）/ 4:3（横版）/ 1:1 / 16:9 / 9:16 / A4 / A3" },
      { name: "packId", type: "number", required: false, description: "参考版式包 ID（从 graphicStylePacks.list 获取，可选）" },
      { name: "assetConfig", type: "object", required: false, description: "素材配置，支持 per_page（按页分配）或 by_type（按类型分组）两种模式（见 JSON 示例）" },
      { name: "title", type: "string", required: false, description: "文档标题（可选）" },
      { name: "imageToolId", type: "number", required: false, description: "指定图像生成工具 ID（可选）" },
    ],
    responseFields: [
      { name: "id", type: "number", description: "排版任务 ID，用于后续查询状态" },
      { name: "status", type: "string", description: "初始状态：pending" },
    ],
    requestExample: {
      docType: "project_board",
      contentText: "N+1 STUDIOS 办公空间设计项目，现代简约风格，强调开放协作与创意氛围",
      pageCount: 3,
      aspectRatio: "3:4",
      assetConfig: {
        mode: "per_page",
        pages: {
          "0": ["https://cdn.example.com/photo1.jpg", "https://cdn.example.com/photo2.jpg"],
          "1": ["https://cdn.example.com/photo3.jpg"],
          "2": ["https://cdn.example.com/photo4.jpg", "https://cdn.example.com/photo5.jpg"],
        }
      },
      title: "百悦科技园项目图板",
    },
    responseExample: {
      data: {
        id: 1001,
        status: "pending",
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/v1/graphic-layout/generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"docType":"project_board","contentText":"N+1 STUDIOS 办公空间设计项目","pageCount":3,"aspectRatio":"3:4","title":"百悦科技园项目图板"}'`,
  },
  {
    step: 2,
    name: "查询排版任务状态",
    endpoint: "graphic-layout/status/:id",
    method: "GET",
    description: "查询图文排版任务的当前状态，建议每 5 秒轮询一次。完成后返回完整的页面数据（含图片 URL 和文字层信息）",
    params: [
      { name: "id", type: "number", required: true, description: "第一步返回的排版任务 ID" },
    ],
    responseFields: [
      { name: "status", type: "string", description: "任务状态：pending / processing / done / failed" },
      { name: "pages", type: "object[]", description: "页面数据数组（仅 status=done 时返回），每页含 pageIndex、imageUrl、textBlocks 等字段" },
      { name: "errorMessage", type: "string", description: "错误信息（仅 status=failed 时返回）" },
    ],
    requestExample: { id: 1001 },
    responseExample: {
      result: {
        data: {
          json: {
            id: 1001,
            status: "done",
            docType: "project_board",
            pageCount: 3,
            aspectRatio: "3:4",
            pages: [
              {
                pageIndex: 0,
                imageUrl: "https://cdn.../graphic-layout/page-0.jpg",
                textBlocks: [
                  { id: "tb_1", text: "百悦科技园", x: 80, y: 120, width: 400, height: 60, fontSize: 48, color: "#1a1a1a", align: "left" }
                ],
              },
            ],
          }
        }
      }
    },
    curlExample: `curl -G '${BASE_URL}/api/v1/graphic-layout/status/1001' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx'`,
  },
  {
    step: 3,
    name: "局部重绘文字区域",
    endpoint: "graphicLayout.inpaintTextBlock",
    method: "POST",
    description: "对已生成页面中的某个文字块进行 AI 局部重绘，修改文案内容。重绘后返回新的整页图片 URL",
    params: [
      { name: "jobId", type: "number", required: true, description: "排版任务 ID" },
      { name: "pageIndex", type: "number", required: true, description: "目标页面索引（从 0 开始）" },
      { name: "blockId", type: "string", required: true, description: "文字块 ID（从 status 接口的 textBlocks[].id 获取）" },
      { name: "newText", type: "string", required: true, description: "替换后的新文案内容" },
      { name: "imageToolId", type: "number", required: false, description: "指定图像生成工具 ID（可选）" },
    ],
    responseFields: [
      { name: "success", type: "boolean", description: "操作是否成功" },
      { name: "newImageUrl", type: "string", description: "重绘后的新页面图片 URL" },
    ],
    requestExample: {
      jobId: 1001,
      pageIndex: 0,
      blockId: "tb_1",
      newText: "百悦科技园·创新中心",
    },
    responseExample: {
      result: {
        data: {
          json: {
            success: true,
            newImageUrl: "https://cdn.../graphic-layout/page-0-v2.jpg",
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/v1/graphic-layout/inpaint' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"jobId":1001,"pageIndex":0,"blockId":"tb_1","newText":"百悦科技园·创新中心"}'`,
  },
  {
    step: 4,
    name: "导出 PDF",
    endpoint: "graphic-layout/export-pdf/:id",
    method: "POST",
    description: "将已完成的图文排版任务导出为 PDF 文件，上传至 S3 并返回下载 URL",
    params: [
      { name: "jobId", type: "number", required: true, description: "排版任务 ID（status 必须为 done）" },
    ],
    responseFields: [
      { name: "url", type: "string", description: "PDF 文件的 CDN 下载 URL" },
    ],
    requestExample: { jobId: 1001 },
    responseExample: {
      result: {
        data: {
          json: {
            url: "https://cdn.../graphic-layout-pdf/1001-1743000000000.pdf",
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/v1/graphic-layout/export-pdf/1001' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  # 无需请求体，jobId 已在路径中`,
  },
];

// ── 案例调研异步 API（三步流程）──────────────────────────
type BenchmarkApiStep = {
  step: number;
  name: string;
  endpoint: string;
  method: "POST" | "GET";
  description: string;
  params: ApiParam[];
  responseFields: ApiResponseField[];
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  curlExample: string;
};

const benchmarkSteps: BenchmarkApiStep[] = [
  {
    step: 1,
    name: "提交生成任务",
    endpoint: "benchmark.generate",
    method: "POST",
    description: "提交案例调研报告生成任务，立即返回 jobId，后台异步生成（约 60-120 秒）",
    params: [
      { name: "projectName", type: "string", required: true, description: "项目名称，如「百悦科技园办公空间」" },
      { name: "requirements", type: "string", required: true, description: "调研需求描述，如「工业风科技感办公空间，面积约3000㎡」" },
      { name: "projectType", type: "string", required: false, default: "\"\"", description: "项目类型，如 office、exhibition、commercial 等（可选）" },
      { name: "referenceCount", type: "number", required: false, default: "5", description: "对标案例数量（1-10，默认 5）" },
      { name: "toolId", type: "number", required: false, description: "指定 AI 工具 ID（可选，不传则使用默认工具）" },
    ],
    responseFields: [
      { name: "jobId", type: "string", description: "任务 ID，用于后续轮询状态" },
    ],
    requestExample: {
      projectName: "百悦科技园办公空间",
      requirements: "工业风科技感办公空间，面积约3000㎡，需要展示科技公司的创新文化",
      projectType: "office",
      referenceCount: 5,
    },
    responseExample: {
      result: {
        data: {
          json: {
            jobId: "V1StGXR8_Z5jdHi6B-myT",
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/benchmark.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"projectName":"百悦科技园办公空间","requirements":"工业风科技感办公空间，面积约3000㎡","projectType":"office","referenceCount":5}}'`,
  },
  {
    step: 2,
    name: "轮询任务状态",
    endpoint: "benchmark.pollStatus",
    method: "GET",
    description: "查询生成任务的当前状态。建议每 3 秒轮询一次，直到 status 变为 done 或 failed",
    params: [
      { name: "jobId", type: "string", required: true, description: "第一步返回的任务 ID" },
    ],
    responseFields: [
      { name: "status", type: "string", description: "任务状态：pending（排队中）/ processing（生成中）/ done（完成）/ failed（失败）/ not_found（任务不存在）" },
      { name: "content", type: "string", description: "生成的报告 Markdown 内容（仅 status=done 时返回）" },
      { name: "historyId", type: "number", description: "生成记录 ID（仅 status=done 时返回）" },
      { name: "generatedAt", type: "string", description: "完成时间 ISO 字符串（仅 status=done 时返回）" },
      { name: "error", type: "string", description: "错误信息（仅 status=failed 时返回）" },
    ],
    requestExample: {
      jobId: "V1StGXR8_Z5jdHi6B-myT",
    },
    responseExample: {
      result: {
        data: {
          json: {
            status: "done",
            content: "# 案例调研报告\n\n## 项目概述\n...",
            historyId: 840010,
            generatedAt: "2026-03-22T10:30:00.000Z",
          }
        }
      }
    },
    curlExample: `curl -G '${BASE_URL}/api/trpc/benchmark.pollStatus' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  --data-urlencode 'input={"json":{"jobId":"V1StGXR8_Z5jdHi6B-myT"}}'`,
  },
  {
    step: 3,
    name: "对话式优化报告",
    endpoint: "benchmark.refine",
    method: "POST",
    description: "基于已生成的报告进行对话式修改优化，提交修改意见后异步生成修订版，同样需要轮询 benchmark.pollStatus",
    params: [
      { name: "currentReport", type: "string", required: true, description: "当前报告的完整 Markdown 内容（从 pollStatus 的 content 字段获取）" },
      { name: "feedback", type: "string", required: true, description: "修改意见，如「增加更多可持续设计案例，减少传统办公案例」" },
      { name: "projectName", type: "string", required: true, description: "项目名称（与生成时保持一致）" },
      { name: "projectType", type: "string", required: false, default: "\"\"", description: "项目类型（可选）" },
      { name: "parentHistoryId", type: "number", required: false, description: "父报告的历史记录 ID（用于关联版本链，建议传入）" },
      { name: "toolId", type: "number", required: false, description: "指定 AI 工具 ID（可选）" },
    ],
    responseFields: [
      { name: "jobId", type: "string", description: "修改任务 ID，使用 benchmark.pollStatus 轮询结果" },
    ],
    requestExample: {
      currentReport: "# 案例调研报告\n\n## 项目概述\n...",
      feedback: "增加更多可持续设计和绿色建筑案例，减少传统办公案例的比重",
      projectName: "百悦科技园办公空间",
      projectType: "office",
      parentHistoryId: 840010,
    },
    responseExample: {
      result: {
        data: {
          json: {
            jobId: "K9mNpQR2_X7keLm3C-abZ",
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/benchmark.refine' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"currentReport":"# 案例调研报告\\n...","feedback":"增加更多可持续设计案例","projectName":"百悦科技园办公空间","parentHistoryId":840010}}'`,
  },
];

export default function ApiDocs() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const apiEndpoint = `${BASE_URL}/api/trpc`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">API</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">N+1 STUDIOS AI API 文档</h1>
          </div>
          <p className="text-slate-600 mb-5">
            完整的 API 参考文档，用于集成 OpenClaw 或其他第三方系统
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${BASE_URL}/integrations`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              获取 API Token <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={`${BASE_URL}/openclaw`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition text-sm"
            >
              OpenClaw 集成指南 <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* OpenAPI Machine-Readable Banner */}
        <Card className="mb-6 p-4 bg-emerald-50 border-emerald-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                <FileJson className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">OpenAPI 3.0 规范（机器可读）</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  可直接导入 OpenClaw、Swagger UI、Postman 等工具。将以下 URL 配置为 OpenClaw 的 API Schema 地址：
                </p>
                <code className="text-xs font-mono bg-emerald-100 px-2 py-0.5 rounded mt-1 inline-block text-emerald-800">
                  {BASE_URL}/api/openapi.json
                </code>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                onClick={() => copyToClipboard(`${BASE_URL}/api/openapi.json`, "openapi-url")}
              >
                {copiedKey === "openapi-url" ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制 URL</>}
              </Button>
              <a
                href={`${BASE_URL}/api/openapi.json`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-100">
                  <BookOpen className="w-3 h-3" /> 查看 JSON
                </Button>
              </a>
            </div>
          </div>
        </Card>

        {/* API Base Endpoint */}
        <Card className="mb-6 p-5 bg-white border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4" /> API 基础端点
          </h2>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <code className="flex-1 text-sm font-mono text-slate-700">{apiEndpoint}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(apiEndpoint, "endpoint")}
              className="gap-2 shrink-0"
            >
              {copiedKey === "endpoint" ? <><Check className="w-4 h-4" /> 已复制</> : <><Copy className="w-4 h-4" /> 复制</>}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">所有 API 路径均以此为前缀，如 <code className="font-mono">{apiEndpoint}/rendering.generate</code></p>
        </Card>

        {/* Authentication */}
        <Card className="mb-8 p-5 bg-white border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> 认证方式
          </h2>

          <p className="text-sm text-slate-600 mb-3">
            所有 API 请求必须在 HTTP 请求头中携带 <strong>Bearer Token</strong>：
          </p>

          {/* Header format */}
          <div className="relative mb-4">
            <div className="p-4 bg-slate-900 rounded-lg font-mono text-sm">
              <span className="text-slate-400">Authorization: </span>
              <span className="text-green-400">Bearer sk_1774xxxxxxxxx_xxxxxxxxxx</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard("Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx", "auth-header")}
              className="absolute top-2 right-2 gap-1 text-xs bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              {copiedKey === "auth-header" ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
            </Button>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="font-semibold text-blue-800 mb-1">Token 格式</p>
              <p className="text-blue-700 font-mono text-xs">sk_&#123;时间戳&#125;_&#123;随机串&#125;</p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-semibold text-amber-800 mb-1">有效期</p>
              <p className="text-amber-700 text-xs">365 天，过期后需重新生成</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-800 mb-1">注意</p>
              <p className="text-red-700 text-xs">Token 仅生成时显示一次，请立即保存</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-4">
            前往 <a href={`${BASE_URL}/integrations`} className="text-blue-600 hover:underline">API 管理页面</a> 生成专属 Token
          </p>
        </Card>

        {/* ── 同步 APIs ── */}
        <h2 className="text-xl font-bold text-slate-900 mb-4">同步 API</h2>
        <p className="text-sm text-slate-500 mb-5">以下 API 在单次请求内完成，直接返回生成结果。</p>

        <div className="space-y-6 mb-12">
          {syncApis.map((api, idx) => (
            <ApiCard
              key={idx}
              api={api}
              idx={idx}
              apiEndpoint={apiEndpoint}
              copiedKey={copiedKey}
              copyToClipboard={copyToClipboard}
            />
          ))}
        </div>

        {/* ── 效果图生成 API（异步两步流程）── */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">AI 效果图生成 API</h2>
          <p className="text-sm text-slate-500 mb-4">
            效果图生成耗时较长（约 30-90 秒），采用<strong>异步任务模式</strong>：先提交任务获取 jobId，再轮询状态，完成后获取图片 URL。
          </p>

          {/* 流程示意 */}
          <div className="flex items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-xl mb-6 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-semibold">
              <span>1</span> POST /api/v1/ai/render
            </div>
            <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" /> 每 3s 轮询
            </div>
            <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg text-sm font-semibold">
              <span>2</span> GET /api/v1/ai/render/:jobId
            </div>
            <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-semibold">
              status = done → 获取图片 URL
            </div>
          </div>

          {/* 接口说明 */}
          <div className="space-y-4 mb-6">
            {/* Step 1 */}
            <Card className="p-5 bg-white border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold">POST</span>
                <code className="text-sm font-mono text-slate-700">{BASE_URL}/api/v1/ai/render</code>
              </div>
              <p className="text-sm text-slate-600 mb-3">提交效果图生成任务，立即返回 jobId，后台异步生成（约 30-90 秒）</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">请求体（JSON）</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "prompt": "现代办公空间，玻璃和木材元素",
  "style": "minimalist"  // 可选
}`}</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">返回（立即）</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": {
    "jobId": "V1StGXR8_Z5jdHi6B-myT",
    "status": "pending"
  }
}`}</pre>
                </div>
              </div>
            </Card>

            {/* Step 2 */}
            <Card className="p-5 bg-white border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs font-bold">GET</span>
                <code className="text-sm font-mono text-slate-700">{BASE_URL}/api/v1/ai/render/:jobId</code>
              </div>
              <p className="text-sm text-slate-600 mb-3">轮询任务状态，建议每 3 秒查询一次，直到 status = done 或 failed</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">生成中返回</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": { "status": "processing" }
}`}</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">完成后返回</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": {
    "status": "done",
    "url": "https://cdn.../rendering/xxx.jpg",
    "prompt": "现代办公空间...",
    "historyId": 840001
  }
}`}</pre>
                </div>
              </div>
            </Card>

            {/* History */}
            <Card className="p-5 bg-white border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs font-bold">GET</span>
                <code className="text-sm font-mono text-slate-700">{BASE_URL}/api/v1/ai/render/history</code>
              </div>
              <p className="text-sm text-slate-600 mb-3">获取当前用户的效果图生成历史记录，支持分页</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">查询参数（可选）</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`?limit=20&offset=0`}</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">返回</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": [ { "id": 840001, "outputUrl": "...", ... } ],
  "total": 42
}`}</pre>
                </div>
              </div>
            </Card>
          </div>

          {/* 轮询代码示例 */}
          <Card className="mb-6 p-5 bg-white border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" /> 轮询示例代码（JavaScript）
            </h3>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{`async function generateRendering(prompt, style, token) {
  const base = '${BASE_URL}/api/v1';
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Step 1: Submit job
  const submitRes = await fetch(base + '/ai/render', {
    method: 'POST', headers, body: JSON.stringify({ prompt, style })
  });
  const { data: { jobId } } = await submitRes.json();

  // Step 2: Poll until done
  while (true) {
    const pollRes = await fetch(base + '/ai/render/' + jobId, { headers });
    const { data } = await pollRes.json();
    if (data.status === 'done') return data.url;  // CDN URL
    if (data.status === 'failed') throw new Error(data.error);
    await new Promise(r => setTimeout(r, 3000));
  }
}`}</pre>
          </Card>
        </div>

        {/* ── AI 分析图 API ── */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">AI 分析图 API</h2>
          <p className="text-sm text-slate-500 mb-4">
            AI 分析图生成耗时约 30-60 秒，采用<strong>异步任务模式</strong>。支持一次提交 1-3 张并行生成，使用 <code className="font-mono text-xs bg-slate-100 px-1 rounded">pollJobs</code> 批量轮询效率更高。
          </p>

          {/* 流程示意 */}
          <div className="flex items-center gap-2 p-4 bg-teal-50 border border-teal-200 rounded-xl mb-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-semibold">
              <span>1</span> analysisImage.submit
            </div>
            <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" /> 每 3s 轮询
            </div>
            <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">
              <span>2</span> pollJob（单张）
            </div>
            <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">
              <span>2'</span> pollJobs（多张）
            </div>
            <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-semibold">
              status = done → 获取图片 URL
            </div>
          </div>

          {/* 比例说明 */}
          <Card className="mb-4 p-4 bg-teal-50 border-teal-200">
            <p className="text-xs font-semibold text-teal-800 mb-2">支持的图片尺寸（aspectRatio 参数）</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ASPECT_RATIO_OPTIONS.map(opt => (
                <div key={opt.value} className="flex items-center gap-2 p-2 bg-white rounded border border-teal-100">
                  <code className="text-xs font-mono text-teal-700">{opt.value}</code>
                  <span className="text-xs text-slate-500">{opt.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 接口卡片 */}
          <div className="space-y-4 mb-6">
            {analysisImageSteps.map((step, idx) => (
              <AnalysisImageStepCard
                key={idx}
                step={step}
                apiEndpoint={apiEndpoint}
                copiedKey={copiedKey}
                copyToClipboard={copyToClipboard}
              />
            ))}
          </div>
        </div>

        {/* ── 图文排版 API ── */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">图文排版 API</h2>
          <p className="text-sm text-slate-500 mb-4">
            图文排版支持品牌手册、商品详情页、项目图板等类型，每页独立异步生成（约 30-60 秒/页）。生成完成后支持对文字区域进行 AI 局部重绘修改，并可导出 PDF。
          </p>

          {/* 流程示意 */}
          <div className="flex items-center gap-2 p-4 bg-purple-50 border border-purple-200 rounded-xl mb-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-semibold">
              <span>1</span> graphicLayout.generate
            </div>
            <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" /> 每 5s 轮询
            </div>
            <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold">
              <span>2</span> graphicLayout.status
            </div>
            <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold">
              <span>3</span> inpaintTextBlock（可选）
            </div>
            <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold">
              <span>4</span> exportPdf（可选）
            </div>
          </div>

          {/* 文档类型说明 */}
          <Card className="mb-4 p-4 bg-purple-50 border-purple-200">
            <p className="text-xs font-semibold text-purple-800 mb-2">文档类型（docType 参数）</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { value: "brand_manual", label: "品牌手册" },
                { value: "product_detail", label: "商品详情页" },
                { value: "project_board", label: "项目图板" },
                { value: "custom", label: "自定义排版" },
              ].map(t => (
                <div key={t.value} className="flex flex-col p-2 bg-white rounded border border-purple-100">
                  <code className="text-xs font-mono text-purple-700">{t.value}</code>
                  <span className="text-xs text-slate-500 mt-0.5">{t.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 接口卡片 */}
          <div className="space-y-4 mb-6">
            {graphicLayoutSteps.map((step, idx) => (
              <GraphicLayoutStepCard
                key={idx}
                step={step}
                apiEndpoint={apiEndpoint}
                copiedKey={copiedKey}
                copyToClipboard={copyToClipboard}
              />
            ))}
          </div>
        </div>

        {/* ── 案例调研 API（异步三步流程）── */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">案例调研 API</h2>
          <p className="text-sm text-slate-500 mb-4">
            案例调研报告生成耗时较长（约 60-120 秒），采用<strong>异步任务模式</strong>：先提交任务获取 jobId，再轮询状态，完成后获取报告内容。
          </p>

          {/* 流程示意 */}
          <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">
              <span>1</span> benchmark.generate
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" /> 每 3s 轮询
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-semibold">
              <span>2</span> benchmark.pollStatus
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-semibold">
              status = done → 获取报告
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold">
              <span>3</span> benchmark.refine（可选）
            </div>
          </div>

          {/* 轮询代码示例 */}
          <Card className="mb-6 p-5 bg-white border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" /> 轮询示例代码（JavaScript）
            </h3>
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(`async function waitForReport(jobId, token) {
  const base = '${BASE_URL}/api/trpc';
  while (true) {
    const res = await fetch(
      base + '/benchmark.pollStatus?input=' + encodeURIComponent(JSON.stringify({ json: { jobId } })),
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const { status, content, historyId, error } = data.result.data.json;

    if (status === 'done') {
      console.log('报告生成完成，historyId:', historyId);
      return content; // Markdown 格式报告内容
    }
    if (status === 'failed') {
      throw new Error('生成失败: ' + error);
    }
    // pending 或 processing，继续等待
    await new Promise(r => setTimeout(r, 3000));
  }
}`, "poll-code")}
                className="absolute top-2 right-2 gap-1 text-xs z-10"
              >
                {copiedKey === "poll-code" ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
              <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{`async function waitForReport(jobId, token) {
  const base = '${BASE_URL}/api/trpc';
  while (true) {
    const res = await fetch(
      base + '/benchmark.pollStatus?input=' + encodeURIComponent(JSON.stringify({ json: { jobId } })),
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const { status, content, historyId, error } = data.result.data.json;

    if (status === 'done') {
      console.log('报告生成完成，historyId:', historyId);
      return content; // Markdown 格式报告内容
    }
    if (status === 'failed') {
      throw new Error('生成失败: ' + error);
    }
    // pending 或 processing，继续等待
    await new Promise(r => setTimeout(r, 3000));
  }
}`}</pre>
            </div>
          </Card>
        </div>

        {/* 三步接口卡片 */}
        <div className="space-y-6 mb-12">
          {benchmarkSteps.map((step, idx) => (
            <BenchmarkStepCard
              key={idx}
              step={step}
              apiEndpoint={apiEndpoint}
              copiedKey={copiedKey}
              copyToClipboard={copyToClipboard}
            />
          ))}
        </div>

        {/* ── 完整调用示例 ── */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-1">完整调用示例</h2>
          <p className="text-sm text-slate-500 mb-5">
            以下示例覆盖认证、项目查询、任务查询、AI 效果图生成全流程，可直接复制使用。
          </p>
          <Tabs defaultValue="nodejs" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="nodejs">Node.js</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>

            {/* Node.js */}
            <TabsContent value="nodejs">
              <Card className="p-5 bg-white border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500">需要 Node.js 18+，无需额外依赖（使用内置 fetch）</p>
                  <CopyButton
                    text={NODE_EXAMPLE}
                    copyKey="nodejs-full"
                    copiedKey={copiedKey}
                    copyToClipboard={copyToClipboard}
                  />
                </div>
                <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{NODE_EXAMPLE}</pre>
              </Card>
            </TabsContent>

            {/* Python */}
            <TabsContent value="python">
              <Card className="p-5 bg-white border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500">需要 Python 3.8+，安装依赖：<code className="font-mono bg-slate-100 px-1 rounded">pip install requests</code></p>
                  <CopyButton
                    text={PYTHON_EXAMPLE}
                    copyKey="python-full"
                    copiedKey={copiedKey}
                    copyToClipboard={copyToClipboard}
                  />
                </div>
                <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{PYTHON_EXAMPLE}</pre>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Error Handling */}
        <Card className="mt-8 p-5 bg-white border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-4">错误处理</h2>
          <div className="space-y-3">
            {[
              { code: "UNAUTHORIZED (10001)", color: "red", desc: "API Token 无效、已过期或未提供 Authorization 请求头" },
              { code: "BAD_REQUEST", color: "orange", desc: "请求参数不正确，请检查必需字段和参数类型" },
              { code: "INTERNAL_SERVER_ERROR", color: "red", desc: "服务器内部错误，AI 生成失败，请稍后重试" },
              { code: "TOO_MANY_REQUESTS", color: "yellow", desc: "请求过于频繁，请降低调用频率" },
            ].map((err, i) => (
              <div key={i} className={`p-3 bg-${err.color}-50 border border-${err.color}-200 rounded-lg flex items-start gap-3`}>
                <code className={`text-${err.color}-800 font-mono text-xs font-semibold shrink-0 mt-0.5`}>{err.code}</code>
                <p className={`text-${err.color}-700 text-sm`}>{err.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-10 text-center text-slate-500 text-sm">
          <p>
            需要帮助？访问{" "}
            <a href={`${BASE_URL}/integrations`} className="text-blue-600 hover:underline">API 管理页面</a>
            {" "}或{" "}
            <a href={`${BASE_URL}/openclaw`} className="text-blue-600 hover:underline">OpenClaw 集成指南</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 同步 API 卡片组件 ──────────────────────────────────────
function ApiCard({
  api,
  idx,
  apiEndpoint,
  copiedKey,
  copyToClipboard,
}: {
  api: ApiDef;
  idx: number;
  apiEndpoint: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  return (
    <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition">
      <div className="mb-5">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{api.name}</h3>
            <p className="text-slate-500 text-sm mt-0.5">{api.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
              {api.method}
            </span>
            <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
              {api.generationTime}
            </span>
          </div>
        </div>

        {/* Endpoint */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <code className="flex-1 text-sm font-mono text-slate-700">
            <span className="text-slate-400">{apiEndpoint}/</span>
            <span className="text-blue-600 font-semibold">{api.endpoint}</span>
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copyToClipboard(`${apiEndpoint}/${api.endpoint}`, `ep-${idx}`)}
            className="gap-1 text-xs"
          >
            {copiedKey === `ep-${idx}` ? <><Check className="w-3 h-3" /> 已复制</> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="curl" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="curl">curl 示例</TabsTrigger>
          <TabsTrigger value="params">请求参数</TabsTrigger>
          <TabsTrigger value="response">返回字段</TabsTrigger>
          <TabsTrigger value="json">JSON 示例</TabsTrigger>
        </TabsList>

        <TabsContent value="curl">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">将 <code className="font-mono bg-slate-100 px-1 rounded">sk_1774xxxxxxxxx_xxxxxxxxxx</code> 替换为你的真实 Token</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(api.curlExample, `curl-${idx}`)}
                className="gap-1 text-xs"
              >
                {copiedKey === `curl-${idx}` ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
            </div>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">
              {api.curlExample}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="params">
          <ParamTable params={api.params} />
        </TabsContent>

        <TabsContent value="response">
          <ResponseTable fields={api.responseFields} />
        </TabsContent>

        <TabsContent value="json" className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">请求体（-d 参数中的 json 字段）</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
              {JSON.stringify(api.requestExample, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">完整返回示例</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
              {JSON.stringify(api.responseExample, null, 2)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── 案例调研步骤卡片组件 ───────────────────────────────────
function BenchmarkStepCard({
  step,
  apiEndpoint,
  copiedKey,
  copyToClipboard,
}: {
  step: BenchmarkApiStep;
  apiEndpoint: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  const stepKey = `bm-${step.step}`;
  return (
    <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition">
      <div className="mb-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {step.step}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{step.name}</h3>
              <p className="text-slate-500 text-sm mt-0.5">{step.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Badge variant="outline" className="text-xs font-semibold border-blue-300 text-blue-700">
              {step.method}
            </Badge>
          </div>
        </div>

        {/* Endpoint */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <code className="flex-1 text-sm font-mono text-slate-700">
            <span className="text-slate-400">{apiEndpoint}/</span>
            <span className="text-blue-600 font-semibold">{step.endpoint}</span>
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copyToClipboard(`${apiEndpoint}/${step.endpoint}`, `ep-${stepKey}`)}
            className="gap-1 text-xs"
          >
            {copiedKey === `ep-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="curl" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="curl">curl 示例</TabsTrigger>
          <TabsTrigger value="params">请求参数</TabsTrigger>
          <TabsTrigger value="response">返回字段</TabsTrigger>
          <TabsTrigger value="json">JSON 示例</TabsTrigger>
        </TabsList>

        <TabsContent value="curl">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">将 <code className="font-mono bg-slate-100 px-1 rounded">sk_1774xxxxxxxxx_xxxxxxxxxx</code> 替换为你的真实 Token</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(step.curlExample, `curl-${stepKey}`)}
                className="gap-1 text-xs"
              >
                {copiedKey === `curl-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
            </div>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">
              {step.curlExample}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="params">
          <ParamTable params={step.params} />
        </TabsContent>

        <TabsContent value="response">
          <ResponseTable fields={step.responseFields} />
        </TabsContent>

        <TabsContent value="json" className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">请求体（-d 参数中的 json 字段）</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
              {JSON.stringify(step.requestExample, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">完整返回示例</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
              {JSON.stringify(step.responseExample, null, 2)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── AI 分析图步骤卡片组件 ──────────────────────────────────
function AnalysisImageStepCard({
  step,
  apiEndpoint,
  copiedKey,
  copyToClipboard,
}: {
  step: AnalysisImageStep;
  apiEndpoint: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  const stepKey = `ai-${step.step}`;
  return (
    <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition">
      <div className="mb-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {step.step}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{step.name}</h3>
              <p className="text-slate-500 text-sm mt-0.5">{step.description}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs font-semibold border-teal-300 text-teal-700 shrink-0 ml-4">
            {step.method}
          </Badge>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <code className="flex-1 text-sm font-mono text-slate-700">
            <span className="text-slate-400">{apiEndpoint}/</span>
            <span className="text-teal-600 font-semibold">{step.endpoint}</span>
          </code>
          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(`${apiEndpoint}/${step.endpoint}`, `ep-${stepKey}`)} className="gap-1 text-xs">
            {copiedKey === `ep-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>
      <Tabs defaultValue="curl" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="curl">curl 示例</TabsTrigger>
          <TabsTrigger value="params">请求参数</TabsTrigger>
          <TabsTrigger value="response">返回字段</TabsTrigger>
          <TabsTrigger value="json">JSON 示例</TabsTrigger>
        </TabsList>
        <TabsContent value="curl">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">将 <code className="font-mono bg-slate-100 px-1 rounded">sk_1774xxxxxxxxx_xxxxxxxxxx</code> 替换为你的真实 Token</p>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(step.curlExample, `curl-${stepKey}`)} className="gap-1 text-xs">
                {copiedKey === `curl-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
            </div>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{step.curlExample}</pre>
          </div>
        </TabsContent>
        <TabsContent value="params"><ParamTable params={step.params} /></TabsContent>
        <TabsContent value="response"><ResponseTable fields={step.responseFields} /></TabsContent>
        <TabsContent value="json" className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">请求体（-d 参数中的 json 字段）</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">{JSON.stringify(step.requestExample, null, 2)}</pre>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">完整返回示例</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">{JSON.stringify(step.responseExample, null, 2)}</pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── 图文排版步骤卡片组件 ──────────────────────────────────
function GraphicLayoutStepCard({
  step,
  apiEndpoint,
  copiedKey,
  copyToClipboard,
}: {
  step: GraphicLayoutStep;
  apiEndpoint: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  const stepKey = `gl-${step.step}`;
  return (
    <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition">
      <div className="mb-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {step.step}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{step.name}</h3>
              <p className="text-slate-500 text-sm mt-0.5">{step.description}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs font-semibold border-purple-300 text-purple-700 shrink-0 ml-4">
            {step.method}
          </Badge>
        </div>
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <code className="flex-1 text-sm font-mono text-slate-700">
            <span className="text-slate-400">{apiEndpoint}/</span>
            <span className="text-purple-600 font-semibold">{step.endpoint}</span>
          </code>
          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(`${apiEndpoint}/${step.endpoint}`, `ep-${stepKey}`)} className="gap-1 text-xs">
            {copiedKey === `ep-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>
      <Tabs defaultValue="curl" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="curl">curl 示例</TabsTrigger>
          <TabsTrigger value="params">请求参数</TabsTrigger>
          <TabsTrigger value="response">返回字段</TabsTrigger>
          <TabsTrigger value="json">JSON 示例</TabsTrigger>
        </TabsList>
        <TabsContent value="curl">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">将 <code className="font-mono bg-slate-100 px-1 rounded">sk_1774xxxxxxxxx_xxxxxxxxxx</code> 替换为你的真实 Token</p>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(step.curlExample, `curl-${stepKey}`)} className="gap-1 text-xs">
                {copiedKey === `curl-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
            </div>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{step.curlExample}</pre>
          </div>
        </TabsContent>
        <TabsContent value="params"><ParamTable params={step.params} /></TabsContent>
        <TabsContent value="response"><ResponseTable fields={step.responseFields} /></TabsContent>
        <TabsContent value="json" className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">请求体（-d 参数中的 json 字段）</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">{JSON.stringify(step.requestExample, null, 2)}</pre>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">完整返回示例</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">{JSON.stringify(step.responseExample, null, 2)}</pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── 共享子组件 ────────────────────────────────────────────
function ParamTable({ params }: { params: ApiParam[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 font-semibold text-slate-700">参数名</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-700">类型</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-700">必需</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-700">说明</th>
          </tr>
        </thead>
        <tbody>
          {params.map((param, pidx) => (
            <tr key={pidx} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2 px-3 font-mono text-slate-900 text-xs">{param.name}</td>
              <td className="py-2 px-3 text-slate-500 text-xs font-mono">{param.type}</td>
              <td className="py-2 px-3">
                <span className={param.required ? "text-red-600 font-semibold text-xs" : "text-slate-400 text-xs"}>
                  {param.required ? "必需" : "可选"}
                </span>
              </td>
              <td className="py-2 px-3 text-slate-600 text-xs">
                {param.description}
                {"default" in param && param.default && (
                  <span className="text-slate-400 ml-1">（默认: {param.default}）</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResponseTable({ fields }: { fields: ApiResponseField[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 font-semibold text-slate-700">字段名</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-700">类型</th>
            <th className="text-left py-2 px-3 font-semibold text-slate-700">说明</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, fidx) => (
            <tr key={fidx} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2 px-3 font-mono text-slate-900 text-xs">{field.name}</td>
              <td className="py-2 px-3 text-slate-500 text-xs font-mono">{field.type}</td>
              <td className="py-2 px-3 text-slate-600 text-xs">{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 mt-3">
        注：tRPC 响应体结构为 <code className="font-mono bg-slate-100 px-1 rounded">{"{ result: { data: { json: { ...fields } } } }"}</code>
      </p>
    </div>
  );
}
