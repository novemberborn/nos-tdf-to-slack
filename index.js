'use strict'

const http = require('http')
const { URL } = require('url')
const { promisify } = require('util')
const { JSDOM } = require('jsdom')
const got = require('got')
const { IncomingWebhook } = require('@slack/client')

const webhook = new IncomingWebhook(process.env.NOS_TDF_SLACK_WEBHOOK_URL)
const send = promisify(webhook.send).bind(webhook)

let pathname = null
let before = null
let clock = 0

let polling = false

async function pollCoverage () {
  const dom = await JSDOM.fromURL('http://nos.nl/tour/live/')
  const elem = dom.window.document.querySelector('[data-liveblog-url]')
  if (elem) {
    pathname = elem.getAttribute('data-liveblog-url')
    before = elem.getAttribute('data-liveblog-end')
    clock++
    setTimeout(pollCoverage, 60 * 60 * 1000)

    console.log(`${before} <${pathname}>`)
  } else {
    pathname = before = null
    clock++
    setTimeout(pollCoverage, 5 * 60 * 1000)

    console.log('No liveblog found')
  }

  if (!polling) {
    polling = true
    pollUpdates()
  }
}

async function pollUpdates () {
  if (!pathname) {
    polling = false
    return
  }

  const startClock = clock
  const { body: html } = await got(`http://nos.nl${pathname}?before=${before}&npo_cc_skip_wall=true`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  })
  const dom = new JSDOM(html)

  const lifo = Array.from(dom.window.document.querySelectorAll('li')).reverse()
  for (const item of lifo) {
    const { textContent: title } = item.querySelector('h2')

    const elements = Array.from(item.querySelector('.liveblog__elements').childNodes).filter(node => node.nodeType === 1)
    const body = elements.reduce((lines, node) => {
      // Improve text representation of video blocks.
      if (node.classList.contains('block_video')) {
        const captionNode = node.querySelector('.caption_content')
        if (captionNode) {
          // Remove geoblock notices
          tryRemove(captionNode.querySelector('.caption_content__icon-wrap'))
          tryRemove(captionNode.querySelector('.caption-description__geo-content'))
        }

        // Play it safe in case there is no caption…
        const caption = normalizeText(captionNode ? captionNode.textContent : '')
        const { href } = node.querySelector('.video-play__link')
        lines.push(`${caption} ${new URL(href, 'https://nos.nl').href}`.trim())
        return lines
      }

      // Improve text representation of image blocks.
      if (node.classList.contains('block_image')) {
        const caption = normalizeText((node.querySelector('.caption_content') || {}).textContent || '')
        const { src } = node.querySelector('img')
        lines.push(`${caption} ${src}`.trim())
        return lines
      }

      // Ensure links are separated by spaces.
      for (const anchor of node.querySelectorAll('a')) {
        const { parentNode } = anchor
        parentNode.insertBefore(dom.window.document.createTextNode(' '), anchor)
        parentNode.insertBefore(dom.window.document.createTextNode(' '), anchor.nextSibling)
      }

      const text = normalizeText(node.textContent)
      if (text) {
        lines.push(text)
      }
      return lines
    }, [])

    const text = `*${title}*\n\n${body.join('\n')}`
    console.log(`${text}\n\n---\n\n`)
    await send(text)

    if (startClock === clock) {
      before = item.getAttribute('id')
    }
  }

  console.log(before)
  dom.window.close()
  setTimeout(pollUpdates, 60 * 1000)
}

function normalizeText (text) {
  return text.trim().split(/\n+/).map(str => str.trim()).join('\n')
}

function tryRemove (node) {
  if (node) {
    node.parentNode.removeChild(node)
  }
}

pollCoverage().catch(err => {
  process.nextTick(() => { throw err })
})

process.on('SIGTERM', () => {
  process.exit(0)
})

process.on('unhandledRejection', err => {
  process.nextTick(() => { throw err })
})

http.createServer((req, res) => {
  res.end('Ahoy, world!')
}).listen(3000)
