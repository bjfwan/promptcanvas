# 后端接口需求

这个项目的前端只依赖一个图片生成接口。后端可以用 Node.js、Python、Go 或其他语言实现，但必须遵守下面的接口合约。

## 后端主要职责

- **保护 OpenAI API Key**：`OPENAI_API_KEY` 只能存在后端环境变量里，不能返回给前端。
- **提供图片生成接口**：接收前端参数，调用 OpenAI Images API。
- **统一返回格式**：前端同时支持图片 URL 和 base64 图片。
- **处理错误**：余额不足、Key 未配置、参数错误、OpenAI 请求失败都要返回清晰错误。
- **允许跨域**：开发环境需要允许前端地址访问，例如 `http://localhost:5173`。
- **限制请求**：建议限制 prompt 长度、count 数量和请求频率，避免误用。

## 推荐环境变量

```env
OPENAI_API_KEY=sk-xxxx
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
```

## 接口

### `POST /api/images/generate`

用于生成图片。

#### Request Body

```json
{
  "prompt": "一只穿着宇航服的橘猫，在月球上拍电影海报",
  "style": "poster",
  "size": "1024x1024",
  "count": 1,
  "outputFormat": "png",
  "negativePrompt": "低清晰度、模糊、水印、错误文字",
  "quality": "auto",
  "creativity": 7,
  "seed": "optional-seed"
}
```

#### 字段说明

- **`prompt`**：必填，字符串，用户输入的提示词。
- **`style`**：选填，字符串，前端会传入风格预设。
- **`size`**：必填，字符串，支持 `1024x1024`、`1024x1536`、`1536x1024`。
- **`count`**：必填，数字，建议范围 `1-4`。
- **`outputFormat`**：选填，字符串，支持 `png`、`jpeg`、`webp`。
- **`negativePrompt`**：选填，字符串，用户不希望出现在图片中的内容。后端可以拼接进最终 prompt，也可以先忽略。
- **`quality`**：选填，字符串，支持 `auto`、`low`、`medium`、`high`。如果当前模型或 SDK 不支持，可以先忽略。
- **`creativity`**：选填，数字，范围 `1-10`。用于表达创意强度，如果后端暂不支持，可以先忽略。
- **`seed`**：选填，字符串，用于复现或标记生成请求。如果后端暂不支持，可以先忽略。

#### Success Response

```json
{
  "requestId": "req_123",
  "images": [
    {
      "id": "img_1",
      "url": "https://example.com/image.png",
      "b64Json": null,
      "mimeType": "image/png",
      "revisedPrompt": "A cinematic poster of an orange cat wearing a spacesuit on the moon"
    }
  ],
  "usage": {
    "model": "gpt-image-1"
  }
}
```

前端兼容两种图片返回方式：

- **方式一**：返回 `url`
- **方式二**：返回 `b64Json` + `mimeType`

如果后端使用 OpenAI 返回 base64，建议这样返回：

```json
{
  "images": [
    {
      "id": "img_1",
      "b64Json": "iVBORw0KGgoAAAANSUhEUg...",
      "mimeType": "image/png"
    }
  ]
}
```

#### Error Response

```json
{
  "error": {
    "code": "OPENAI_REQUEST_FAILED",
    "message": "图片生成失败，请稍后再试"
  }
}
```

#### 推荐错误码

- **`INVALID_REQUEST`**：请求参数不合法。
- **`MISSING_API_KEY`**：后端没有配置 `OPENAI_API_KEY`。
- **`OPENAI_REQUEST_FAILED`**：OpenAI API 请求失败。
- **`RATE_LIMITED`**：请求太频繁。
- **`INTERNAL_ERROR`**：未知服务器错误。

## OpenAI 调用建议

后端建议使用 OpenAI 官方 SDK。模型建议先使用：

```txt
gpt-image-1
```

后端可以根据 `style` 拼接系统化提示词，例如：

```txt
用户提示词：{prompt}
风格要求：{style}
避免内容：{negativePrompt}
创意强度：{creativity}/10
输出要求：高质量、构图完整、细节清晰
```

## CORS 要求

开发时至少允许：

```txt
http://localhost:5173
```

## 前端开发地址

```txt
http://localhost:5173
```

## 前端默认请求地址

如果 `.env` 里没有设置 `VITE_API_BASE_URL`，前端会默认请求当前域名下的：

```txt
/api/images/generate
```

如果后端独立运行在 `http://localhost:8787`，前端 `.env` 应该写：

```env
VITE_API_BASE_URL=http://localhost:8787
```
