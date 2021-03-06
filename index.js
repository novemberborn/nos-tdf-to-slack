'use strict'

const { URL } = require('url')
const { JSDOM } = require('jsdom')
const got = require('got')
const { IncomingWebhook } = require('@slack/webhook')

const webhook = new IncomingWebhook(process.env.NOS_TDF_SLACK_WEBHOOK_URL)

let pathname = null
let before
let clock = 0
let day = 0

let polling = false

async function pollCoverage () {
  const dom = await JSDOM.fromURL('https://nos.nl/tour/live/')
  const elem = dom.window.document.querySelector('[data-liveblog-url]')
  if (elem) {
    const newUrl = elem.getAttribute('data-liveblog-url')
    if (pathname !== newUrl) { // Update the path we're polling from.
      pathname = newUrl

      // The path may change throughout the day.
      const today = new Date().getUTCDate()
      if (day !== today) {
        // Only on new days do we fetch all updates.
        day = today
        before = undefined
      } else {
        // Ensure our ID has not been invalidated.
        before = elem.getAttribute('data-liveblog-end')
      }
      clock++
    }
    setTimeout(pollCoverage, 15 * 60 * 1000)

    console.log(`${before || 'everything'} <${pathname}>`)
  }

  if (!polling) {
    polling = true
    pollUpdates()
  }
}

async function pollUpdates () {
  const startClock = clock
  const { body: html } = await got(`https://nos.nl${pathname}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    query: { before: before || undefined }
  })
  const dom = new JSDOM(html)

  const lifo = Array.from(dom.window.document.querySelectorAll('li')).reverse()
  for (const item of lifo) {
    const h2 = item.querySelector('h2')
    if (!h2) continue

    const { textContent: title } = h2

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

      // Ignore nested audio blocks
      if (node.classList.contains('block_audio')) {
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
    await webhook.send({ text })

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

pollCoverage()

process.on('SIGTERM', () => {
  process.exit(0)
})

process.on('unhandledRejection', err => {
  process.nextTick(() => { throw err })
})
