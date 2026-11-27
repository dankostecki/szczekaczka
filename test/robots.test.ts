// public/robots.txt: the whole site is closed to robots; ChatGPT, opening the pack for the morning briefing at a user's request, may read that one address
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { robotsAllow, robotsRules } from '../worker/briefing/web'

const txt = readFileSync(join(process.cwd(), 'public/robots.txt'), 'utf8') // npm test runs from the repository (the tests run bundled elsewhere)
const allowed = (agent: string, path: string) => robotsAllow(robotsRules(txt, agent), path)

test('ChatGPT may open the pack and nothing else; every other robot, AI crawlers included, nothing', () => {
  const chatgpt = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'
  assert.equal(allowed(chatgpt, '/api/briefing/pack.md'), true)
  for (const path of ['/', '/api/news', '/api/briefing', '/api/briefing/pack.md.bak', '/poranek/']) assert.equal(allowed(chatgpt, path), false, path)
  for (const agent of ['GPTBot/1.1', 'OAI-SearchBot/1.0', 'ClaudeBot/1.0', 'Googlebot/2.1', 'SomeCrawler']) {
    assert.equal(allowed(agent, '/api/briefing/pack.md'), false, agent)
    assert.equal(allowed(agent, '/'), false, agent)
  }
})

test('the technical file of the last 24 hours: ChatGPT and Claude may open it when given its address; crawlers may not', () => {
  const chatgpt = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'
  const claude = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)'
  for (const agent of [chatgpt, claude]) {
    for (const path of ['/api/digest.json', '/api/digest-night.json', '/api/digest-morning.json', '/api/digest-midday.json']) assert.equal(allowed(agent, path), true, `${agent} ${path}`)
    for (const path of ['/', '/api/news', '/api/digest.json.bak', '/api/digest']) assert.equal(allowed(agent, path), false, path)
  }
  assert.equal(allowed(claude, '/api/briefing/pack.md'), false)
  for (const agent of ['GPTBot/1.1', 'ClaudeBot/1.0', 'Googlebot/2.1', 'SomeCrawler']) for (const path of ['/api/digest.json', '/api/digest-night.json']) assert.equal(allowed(agent, path), false, agent)
})
