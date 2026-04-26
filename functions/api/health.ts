// GET /api/health：用于探活与前端连通性自检，与 Express 版本响应字段对齐。

interface Env {
  OPENAI_IMAGE_MODEL?: string
  CF_PAGES_COMMIT_SHA?: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const model = context.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  const requestId = (context.data.requestId as string | undefined) ?? ''

  return Response.json({
    ok: true,
    model,
    version: context.env.CF_PAGES_COMMIT_SHA || 'edge',
    requestId,
  })
}
