import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')
const imagePath = join(repoRoot, 'artifacts', 'rich-menu', 'eiken-rich-menu-final.jpg')

const accountId = 'e1f32fe7-1787-4f3d-a8bc-9a528a1d842e'
const groupId = '5728e4d0-dd85-4a55-bf63-d8e8b666b296'
const pageId = '0dec2d47-504b-4215-8ca7-073201a535b1'
const aliasId = 'lhx-5728e4d0-0'
const menuName = '5728e4d0 - ページ 1'

async function lineJson(token, method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    throw new Error(`LINE ${method} ${url} failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function lineNoContent(token, method, url, body, contentType, allowed = [200, 201, 202, 204]) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    ...(body ? { body } : {}),
  })
  if (!allowed.includes(response.status)) {
    throw new Error(`LINE ${method} ${url} failed: ${response.status} ${await response.text()}`)
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const token = process.env.EIKEN_LINE_TOKEN
if (!token) throw new Error('Target LINE account token was not provided.')
const rows = JSON.parse(process.env.EIKEN_MENU_ROWS_JSON ?? '[]')
if (rows.length !== 4) throw new Error(`Expected 4 rich-menu areas, found ${rows.length}.`)

const areas = rows.map((row) => {
  const actionData = JSON.parse(row.action_data)
  const action = row.action_type === 'uri'
    ? { type: 'uri', uri: actionData.uri }
    : row.action_type === 'message'
      ? { type: 'message', text: actionData.text }
      : null
  if (!action) throw new Error(`Unsupported action type: ${row.action_type}`)
  return {
    bounds: {
      x: row.bounds_x,
      y: row.bounds_y,
      width: row.bounds_width,
      height: row.bounds_height,
    },
    action,
  }
})

const oldRichMenuId = rows[0].line_richmenu_id
const list = await lineJson(token, 'GET', 'https://api.line.me/v2/bot/richmenu/list')
for (const menu of list.richmenus ?? []) {
  if (menu.richMenuId !== oldRichMenuId && menu.name.startsWith(`${groupId.slice(0, 8)} -`)) {
    await lineNoContent(token, 'DELETE', `https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, null, null, [200, 204, 404])
  }
}

let newRichMenuId = null
let aliasUpdated = false
try {
  const created = await lineJson(token, 'POST', 'https://api.line.me/v2/bot/richmenu', {
    size: { width: 2500, height: 1686 },
    selected: false,
    name: menuName,
    chatBarText: rows[0].chat_bar_text,
    areas,
  })
  newRichMenuId = created.richMenuId
  if (!/^richmenu-[A-Za-z0-9]+$/.test(newRichMenuId)) throw new Error('LINE returned an invalid rich-menu ID.')

  const image = readFileSync(imagePath)
  await wait(4000)
  let uploaded = false
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await lineNoContent(
        token,
        'POST',
        `https://api-data.line.me/v2/bot/richmenu/${newRichMenuId}/content`,
        image,
        'image/jpeg',
      )
      uploaded = true
      break
    } catch (error) {
      if (attempt === 8) throw error
      await wait(2000)
    }
  }
  if (!uploaded) throw new Error('LINE image upload did not complete.')

  await lineNoContent(token, 'DELETE', `https://api.line.me/v2/bot/richmenu/alias/${aliasId}`, null, null, [200, 204, 404])
  await lineJson(token, 'POST', 'https://api.line.me/v2/bot/richmenu/alias', {
    richMenuAliasId: aliasId,
    richMenuId: newRichMenuId,
  })
  aliasUpdated = true

  if (/^richmenu-[A-Za-z0-9]+$/.test(oldRichMenuId)) {
    await lineNoContent(token, 'DELETE', `https://api.line.me/v2/bot/richmenu/${oldRichMenuId}`, null, null, [200, 204, 404])
  }
  await lineNoContent(token, 'POST', `https://api.line.me/v2/bot/user/all/richmenu/${newRichMenuId}`)

  const [defaultState, aliasState, menuState] = await Promise.all([
    lineJson(token, 'GET', 'https://api.line.me/v2/bot/user/all/richmenu'),
    lineJson(token, 'GET', `https://api.line.me/v2/bot/richmenu/alias/${aliasId}`),
    lineJson(token, 'GET', `https://api.line.me/v2/bot/richmenu/${newRichMenuId}`),
  ])

  const published = defaultState.richMenuId === newRichMenuId
    && aliasState.richMenuId === newRichMenuId
    && menuState.chatBarText === '英検集中講座メニュー'
    && menuState.areas?.length === 4
    && menuState.areas[0]?.action?.uri?.includes('page=form')
    && menuState.areas[1]?.action?.uri === 'https://eiken-intensive-tuition-lp-2026.vercel.app/'
    && menuState.areas[2]?.action?.uri?.includes('page=event')
    && menuState.areas[3]?.action?.text === 'お知らせ'

  console.log(JSON.stringify({
    accountId,
    oldRichMenuId,
    newRichMenuId,
    defaultRichMenuId: defaultState.richMenuId,
    aliasRichMenuId: aliasState.richMenuId,
    chatBarText: menuState.chatBarText,
    areaCount: menuState.areas?.length,
    published,
  }))
} catch (error) {
  if (newRichMenuId && !aliasUpdated) {
    try {
      await lineNoContent(token, 'DELETE', `https://api.line.me/v2/bot/richmenu/${newRichMenuId}`, null, null, [200, 204, 404])
    } catch {}
  }
  throw error
}
